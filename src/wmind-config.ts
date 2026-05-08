import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const WMIND_CONFIG_DIR = join(homedir(), '.wmind');
const WMIND_CONFIG_PATH = join(WMIND_CONFIG_DIR, 'config.json');

export interface WmindConfig {
  [key: string]: any;
  localFastBaseUrl?: string;
  defaultModel?: string;
}

export function loadWmindConfig(): WmindConfig {
  if (!existsSync(WMIND_CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(WMIND_CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveWmindConfig(config: WmindConfig): void {
  if (!existsSync(WMIND_CONFIG_DIR)) return;
  writeFileSync(WMIND_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function configureWmind(baseUrl: string, modelName: string): boolean {
  const config = loadWmindConfig();

  config.localFastBaseUrl = baseUrl;
  config.defaultModel = modelName;

  saveWmindConfig(config);
  return true;
}

export function clearWmindConfig(): boolean {
  const config = loadWmindConfig();

  delete config.localFastBaseUrl;

  saveWmindConfig(config);
  return true;
}
