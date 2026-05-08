import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import pc from 'picocolors';

export interface DownloadResult {
  success: boolean;
  path: string;
  error?: string;
}

export function getHfCliPath(): string {
  const venv = join(homedir(), '.venv', 'vllm-mlx');
  const hfBin = join(venv, 'bin', 'hf');

  if (existsSync(hfBin)) return hfBin;

  const legacyBin = join(venv, 'bin', 'huggingface-cli');
  if (existsSync(legacyBin)) return legacyBin;

  return 'hf';
}

export function downloadModel(
  hfId: string,
  onProgress?: (message: string) => void,
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const cli = getHfCliPath();
    const isHf = cli.endsWith('/hf') || cli === 'hf';
    const args = isHf ? ['download', hfId] : ['download', hfId];

    onProgress?.(`Downloading ${pc.cyan(hfId)}...`);

    const child = execFile(cli, args, {
      timeout: 30 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    });

    let stderr = '';

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;

      const match = text.match(/(\d+)%\|/);
      if (match) {
        onProgress?.(`  ${match[1]}%`);
      } else if (text.includes('Fetching')) {
        onProgress?.('  Fetching metadata...');
      } else if (text.includes('Downloading')) {
        onProgress?.('  Downloading...');
      }
    });

    child.stdout?.on('data', () => {});

    child.on('close', (code: number | null) => {
      if (code === 0) {
        onProgress?.(pc.green('  Done.'));
        resolve({ success: true, path: '' });
      } else {
        const errMsg = stderr.trim().split('\n').at(-1) || `Exit code ${code}`;
        resolve({ success: false, path: '', error: errMsg });
      }
    });

    child.on('error', (err: Error) => {
      resolve({ success: false, path: '', error: err.message });
    });
  });
}

export function deleteModelFromCache(hfId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cli = getHfCliPath();
    const isHf = cli.endsWith('/hf') || cli === 'hf';
    const args = isHf ? ['cache', 'delete', hfId, '--yes'] : ['delete-cache', hfId, '--yes'];

    const child = execFile(cli, args, {
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    child.on('close', (code: number | null) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}
