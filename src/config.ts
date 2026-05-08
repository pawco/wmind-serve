import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_PORT = 19421;

const ENV_FILE_PATHS = [
  join(homedir(), '.wmind-serve', '.env'),
  join(process.cwd(), '.env'),
];

let envLoaded = false;
const envCache: Record<string, string | undefined> = {};

function loadEnvFile(): void {
  if (envLoaded) return;
  envLoaded = true;

  for (const path of ENV_FILE_PATHS) {
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env)) {
          process.env[key] = value;
        }
        envCache[key] = value;
      }
    } catch {
      // skip unreadable env files
    }
  }
}

export function getPortFromEnv(): number {
  loadEnvFile();

  const raw = process.env.WMIND_PORT ?? envCache['WMIND_PORT'];
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }

  return DEFAULT_PORT;
}
