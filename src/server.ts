import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import pc from 'picocolors';
import type { ServerConfig } from './index-manager.js';
import { loadServerConfig, saveServerConfig } from './index-manager.js';
import { DEFAULT_PORT, getPortFromEnv } from './config.js';

const VENV_DIR = join(homedir(), '.venv', 'vllm-mlx');
const VENV_BIN = join(VENV_DIR, 'bin');

export function getVenvDir(): string {
  return VENV_DIR;
}

export function getVenvBin(name: string): string {
  return join(VENV_BIN, name);
}

export function isVenvReady(): boolean {
  return existsSync(getVenvBin('vllm-mlx'));
}

export async function ensureVenv(): Promise<boolean> {
  if (isVenvReady()) return true;

  console.log(pc.dim('  Setting up vllm-mlx environment...'));

  return new Promise((resolve) => {
    const child = spawn('python3', ['-m', 'venv', VENV_DIR], {
      stdio: 'pipe',
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error(pc.red('  Failed to create virtual environment.'));
        resolve(false);
        return;
      }

      const pip = join(VENV_BIN, 'pip');
      const install = spawn(pip, ['install', 'vllm-mlx'], {
        stdio: 'pipe',
      });

      let stderr = '';
      install.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

      install.on('close', (installCode: number | null) => {
        if (installCode !== 0) {
          console.error(pc.red('  Failed to install vllm-mlx.'));
          console.error(pc.dim(stderr.slice(-500)));
          resolve(false);
          return;
        }
        console.log(pc.green('  vllm-mlx installed.'));
        resolve(true);
      });
    });
  });
}

export async function isServerRunning(port?: number): Promise<boolean> {
  const config = loadServerConfig();
  const checkPort = port ?? config.port ?? getPortFromEnv();

  try {
    const response = await fetch(`http://127.0.0.1:${checkPort}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function startServer(
  modelPath: string,
  modelName: string,
  port: number = DEFAULT_PORT,
): Promise<{ success: boolean; pid?: number; error?: string }> {
  if (await isServerRunning(port)) {
    console.log(pc.dim(`  vllm-mlx already running on port ${port}`));
    const existingConfig = loadServerConfig();
    return { success: true, pid: existingConfig.pid ?? undefined };
  }

  const vllmMlx = getVenvBin('vllm-mlx');

  if (!existsSync(vllmMlx)) {
    const ready = await ensureVenv();
    if (!ready) {
      return { success: false, error: 'vllm-mlx not installed and auto-install failed' };
    }
  }

  return new Promise((resolve) => {
    const args = [
      'serve',
      modelPath,
      '--served-model-name', modelName,
      '--host', '127.0.0.1',
      '--port', String(port),
    ];

    const child = spawn(vllmMlx, args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `${VENV_BIN}:${process.env.PATH}`,
      },
    });

    child.unref();

    const pid = child.pid;
    if (!pid) {
      resolve({ success: false, error: 'Failed to spawn server process' });
      return;
    }

    const config: ServerConfig = {
      activeModel: modelName,
      port,
      pid,
      baseUrl: `http://127.0.0.1:${port}/v1`,
    };

    saveServerConfig(config);

    const startTime = Date.now();
    const maxWait = 60_000;
    const checkInterval = 1000;

    const check = async () => {
      const running = await isServerRunning(port);
      if (running) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(pc.green(`  Server ready in ${elapsed}s`));
        resolve({ success: true, pid });
        return;
      }

      if (Date.now() - startTime > maxWait) {
        resolve({ success: false, error: `Server did not start within ${maxWait / 1000}s` });
        return;
      }

      setTimeout(check, checkInterval);
    };

    check();
  });
}

export function stopServer(): boolean {
  const config = loadServerConfig();

  if (!config.pid) {
    console.log(pc.dim('  No server running.'));
    return false;
  }

  try {
    process.kill(config.pid, 'SIGTERM');

    saveServerConfig({
      ...config,
      pid: null,
      activeModel: null,
    });

    console.log(pc.green('  Server stopped.'));
    return true;
  } catch {
    saveServerConfig({
      ...config,
      pid: null,
      activeModel: null,
    });

    console.log(pc.dim('  Server process not found (already stopped).'));
    return true;
  }
}

export async function getServerStatus(): Promise<{
  running: boolean;
  model: string | null;
  port: number;
  pid: number | null;
  baseUrl: string;
}> {
  const config = loadServerConfig();
  const running = await isServerRunning(config.port);

  return {
    running,
    model: config.activeModel,
    port: config.port,
    pid: config.pid,
    baseUrl: config.baseUrl,
  };
}
