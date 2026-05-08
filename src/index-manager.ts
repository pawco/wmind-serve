import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CatalogModel } from './catalog.js';
import type { ScannedModel } from './scanner.js';

export interface IndexedModel {
  name: string;
  source: 'huggingface' | 'ollama';
  hfId: string;
  path: string;
  sizeBytes: number;
  sizeHuman: string;
  params: string;
  quant: string;
  minRamGB: number;
  family: string;
  instructionTuned: boolean;
  downloadedAt: string | null;
  tightFit: boolean;
}

export interface IndexData {
  version: number;
  models: Record<string, IndexedModel>;
}

const SERVE_DIR = join(homedir(), '.wmind-serve');
const INDEX_PATH = join(SERVE_DIR, 'index.json');
const CONFIG_PATH = join(SERVE_DIR, 'config.json');

export interface ServerConfig {
  activeModel: string | null;
  port: number;
  pid: number | null;
  baseUrl: string;
}

export function getServeDir(): string {
  return SERVE_DIR;
}

export function getIndexPath(): string {
  return INDEX_PATH;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadIndex(): IndexData {
  if (!existsSync(INDEX_PATH)) {
    return { version: 1, models: {} };
  }
  try {
    const raw = readFileSync(INDEX_PATH, 'utf-8');
    return JSON.parse(raw) as IndexData;
  } catch {
    return { version: 1, models: {} };
  }
}

export function saveIndex(index: IndexData): void {
  mkdirSync(SERVE_DIR, { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

export function addCatalogModelToIndex(
  index: IndexData,
  model: CatalogModel,
  path: string,
  tightFit: boolean,
  downloadedAt: string | null = null,
): IndexData {
  const updated = { ...index, models: { ...index.models } };
  updated.models[model.name] = {
    name: model.name,
    source: 'huggingface',
    hfId: model.hfId,
    path,
    sizeBytes: model.sizeBytes,
    sizeHuman: model.sizeHuman,
    params: model.params,
    quant: model.quant,
    minRamGB: model.minRamGB,
    family: model.family,
    instructionTuned: model.instructionTuned,
    downloadedAt,
    tightFit,
  };
  return updated;
}

export function addScannedModelToIndex(
  index: IndexData,
  scanned: ScannedModel,
  tightFit: boolean,
): IndexData {
  const updated = { ...index, models: { ...index.models } };
  const name = scanned.id;
  const hfId = scanned.hfId ?? '';
  const sizeHuman = formatBytes(scanned.sizeBytes);

  const catalogMeta = scanned.catalogModel;
  const inferredParams = catalogMeta?.params ?? inferParamsFromId(scanned.hfId ?? scanned.ollamaName ?? '');
  const inferredQuant = catalogMeta?.quant ?? inferQuantFromId(scanned.hfId ?? scanned.ollamaName ?? '');
  const inferredFamily = catalogMeta?.family ?? inferFamilyFromId(scanned.hfId ?? scanned.ollamaName ?? '');

  updated.models[name] = {
    name,
    source: scanned.source,
    hfId,
    path: scanned.localPath,
    sizeBytes: scanned.sizeBytes,
    sizeHuman,
    params: inferredParams,
    quant: inferredQuant,
    minRamGB: 0,
    family: inferredFamily,
    instructionTuned: catalogMeta?.instructionTuned ?? true,
    downloadedAt: new Date().toISOString(),
    tightFit,
  };
  return updated;
}

function inferParamsFromId(id: string): string {
  const match = id.match(/(\d+(?:\.\d+)?)\s*b/i);
  if (match) return match[1].toUpperCase().replace(/B$/, 'B');
  return '?';
}

function inferQuantFromId(id: string): string {
  if (/8bit|bf16/i.test(id)) return '8-bit';
  if (/4bit|4-bit/i.test(id)) return '4-bit';
  if (/6bit/i.test(id)) return '6-bit';
  return '-';
}

function inferFamilyFromId(id: string): string {
  if (/gemma/i.test(id)) return 'gemma';
  if (/qwen/i.test(id)) return 'qwen';
  if (/llama/i.test(id)) return 'llama';
  if (/phi/i.test(id)) return 'phi';
  if (/deepseek/i.test(id)) return 'deepseek';
  if (/mistral/i.test(id)) return 'mistral';
  if (/nemotron/i.test(id)) return 'nemotron';
  return 'other';
}

export function removeModelFromIndex(index: IndexData, name: string): IndexData {
  const updated = { ...index, models: { ...index.models } };
  delete updated.models[name];
  return updated;
}

export function loadServerConfig(): ServerConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { activeModel: null, port: 0, pid: null, baseUrl: '' };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as ServerConfig;
  } catch {
    return { activeModel: null, port: 0, pid: null, baseUrl: '' };
  }
}

export function saveServerConfig(config: ServerConfig): void {
  mkdirSync(SERVE_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getTotalDiskUsage(index: IndexData): number {
  return Object.values(index.models).reduce((sum, m) => sum + m.sizeBytes, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
