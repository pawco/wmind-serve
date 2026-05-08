import { existsSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CatalogModel } from './catalog.js';
import { findCatalogModelByHfId, findCatalogModelByAlias } from './catalog.js';

export interface ScannedModel {
  id: string;
  source: 'huggingface' | 'ollama';
  hfId?: string;
  ollamaName?: string;
  localPath: string;
  sizeBytes: number;
  catalogModel?: CatalogModel;
}

const HF_CACHE_DIR = join(homedir(), '.cache', 'huggingface', 'hub');
const OLLAMA_MODELS_DIR = join(homedir(), '.ollama', 'models');

export function getHfCacheDir(): string {
  return HF_CACHE_DIR;
}

export function getOllamaModelsDir(): string {
  return OLLAMA_MODELS_DIR;
}

export function scanAllCaches(): ScannedModel[] {
  return [...scanHfCache(), ...scanOllamaCache()].sort((a, b) => a.id.localeCompare(b.id));
}

export function scanHfCache(): ScannedModel[] {
  if (!existsSync(HF_CACHE_DIR)) return [];

  const models: ScannedModel[] = [];
  const entries = readdirSync(HF_CACHE_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('models--')) continue;
    if (entry.name === 'CACHEDIR.TAG') continue;

    const hfId = entry.name.replace(/^models--/, '').replace(/--/g, '/');
    if (!hfId.includes('/')) continue;

    const modelDir = join(HF_CACHE_DIR, entry.name);
    const snapshotsDir = join(modelDir, 'snapshots');

    if (!existsSync(snapshotsDir)) continue;

    const snapshots = readdirSync(snapshotsDir, { withFileTypes: true });
    if (snapshots.length === 0) continue;

    const latestSnapshot = snapshots
      .filter((s: Dirent) => s.isDirectory())
      .sort()
      .at(-1);

    if (!latestSnapshot) continue;

    const snapshotPath = join(snapshotsDir, latestSnapshot.name);
    const sizeBytes = getDirSize(snapshotPath);
    const catalogModel = findCatalogModelByHfId(hfId);
    const id = catalogModel?.name ?? hfId.replace(/\//g, '--');

    models.push({
      id,
      source: 'huggingface',
      hfId,
      localPath: snapshotPath,
      sizeBytes,
      catalogModel,
    });
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export function scanOllamaCache(): ScannedModel[] {
  const manifestsDir = join(OLLAMA_MODELS_DIR, 'manifests', 'registry.ollama.ai', 'library');
  if (!existsSync(manifestsDir)) return [];

  const models: ScannedModel[] = [];

  const families = readdirSync(manifestsDir, { withFileTypes: true });
  for (const family of families) {
    if (!family.isDirectory()) continue;

    const versionsDir = join(manifestsDir, family.name);
    const versions = readdirSync(versionsDir, { withFileTypes: true });

    for (const version of versions) {
      if (!version.isFile()) continue;

      const ollamaName = `${family.name}:${version.name}`;
      const manifestPath = join(versionsDir, version.name);

      let sizeBytes = 0;
      try {
        sizeBytes = statSync(manifestPath).size;
      } catch {
        continue;
      }

      const id = `ollama/${ollamaName}`;
      const catalogModel = findCatalogModelByAlias(ollamaName);

      models.push({
        id,
        source: 'ollama',
        ollamaName,
        localPath: manifestPath,
        sizeBytes,
        catalogModel,
      });
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

function getDirSize(dir: string): number {
  let totalSize = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirSize(fullPath);
      } else {
        try {
          totalSize += statSync(fullPath).size;
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }
  return totalSize;
}

export function isModelDownloaded(hfId: string): boolean {
  const dirName = `models--${hfId.replace(/\//g, '--')}`;
  const snapshotsDir = join(HF_CACHE_DIR, dirName, 'snapshots');

  if (!existsSync(snapshotsDir)) return false;

  try {
    const snapshots = readdirSync(snapshotsDir, { withFileTypes: true });
    return snapshots.some((s: Dirent) => s.isDirectory());
  } catch {
    return false;
  }
}

export function getModelSnapshotPath(hfId: string): string | null {
  const dirName = `models--${hfId.replace(/\//g, '--')}`;
  const snapshotsDir = join(HF_CACHE_DIR, dirName, 'snapshots');

  if (!existsSync(snapshotsDir)) return null;

  try {
    const snapshots = readdirSync(snapshotsDir, { withFileTypes: true });
    const latestSnapshot = snapshots
      .filter((s: Dirent) => s.isDirectory())
      .sort()
      .at(-1);

    return latestSnapshot ? join(snapshotsDir, latestSnapshot.name) : null;
  } catch {
    return null;
  }
}

export function isOllamaModelDownloaded(name: string): boolean {
  const manifestDir = join(OLLAMA_MODELS_DIR, 'manifests', 'registry.ollama.ai', 'library');
  if (!existsSync(manifestDir)) return false;

  const [family, version] = name.includes(':') ? name.split(':') : [name, 'latest'];
  return existsSync(join(manifestDir, family, version));
}
