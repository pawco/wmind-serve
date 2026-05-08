import { execSync } from 'node:child_process';

export interface HardwareInfo {
  chip: string;
  unifiedMemoryGB: number;
  gpuCores: number;
  cpuCores: number;
}

const CHIP_MEMORY: Record<string, number[]> = {
  M1: [8, 16],
  M1_Pro: [16, 32],
  M1_Max: [32, 64],
  M1_Ultra: [64, 128],
  M2: [8, 16, 24],
  M2_Pro: [16, 32],
  M2_Max: [32, 64, 96],
  M2_Ultra: [64, 128, 192],
  M3: [8, 16, 24],
  M3_Pro: [18, 36],
  M3_Max: [36, 64, 96, 128],
  M4: [16, 24, 32],
  M4_Pro: [24, 48],
  M4_Max: [36, 48, 64, 128],
  M4_Ultra: [64, 128, 256],
};

const CHIP_GPU_CORES: Record<string, number> = {
  M1: 7,
  M1_Pro: 14,
  M1_Max: 24,
  M1_Ultra: 32,
  M2: 8,
  M2_Pro: 16,
  M2_Max: 24,
  M2_Ultra: 32,
  M3: 10,
  M3_Pro: 18,
  M3_Max: 30,
  M4: 10,
  M4_Pro: 16,
  M4_Max: 30,
  M4_Ultra: 40,
};

export function detectHardware(): HardwareInfo {
  if (process.platform !== 'darwin') {
    throw new Error('wmind-serve MVP only supports macOS (Apple Silicon)');
  }

  const chip = detectChip();
  const unifiedMemoryGB = detectMemoryGB();
  const gpuCores = CHIP_GPU_CORES[chip] ?? 8;
  const cpuCores = detectCpuCores();

  return { chip, unifiedMemoryGB, gpuCores, cpuCores };
}

function detectChip(): string {
  try {
    const output = execSync('sysctl -n machdep.cpu.brand_string', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const match = output.match(/Apple (M\d+(?:\s+\w+)?)/);
    if (match) {
      return match[1].replace(/\s+/g, '_');
    }
  } catch {}

  try {
    const output = execSync('system_profiler SPHardwareDataType', {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const match = output.match(/Chip:\s*Apple\s+(M\d+(?:\s+\w+)?)/);
    if (match) {
      return match[1].replace(/\s+/g, '_');
    }
  } catch {}

  return 'M1';
}

function detectMemoryGB(): number {
  try {
    const output = execSync('sysctl -n hw.memsize', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return Math.round(Number(output) / (1024 * 1024 * 1024));
  } catch {
    return 8;
  }
}

function detectCpuCores(): number {
  try {
    const output = execSync('sysctl -n hw.ncpu', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return Number(output) || 8;
  } catch {
    return 8;
  }
}

export function getAvailableRamGB(hw: HardwareInfo): number {
  return Math.round(hw.unifiedMemoryGB * 0.5);
}

export function modelFitsHardware(modelMinRamGB: number, hw: HardwareInfo): boolean {
  return hw.unifiedMemoryGB >= modelMinRamGB;
}

export function modelTightFit(modelMinRamGB: number, hw: HardwareInfo): boolean {
  const available = getAvailableRamGB(hw);
  return hw.unifiedMemoryGB >= modelMinRamGB && available < modelMinRamGB;
}

export function formatChipName(chip: string): string {
  return chip.replace(/_/g, ' ');
}

export function getChipMemoryOptions(chip: string): number[] {
  return CHIP_MEMORY[chip] ?? [8, 16];
}
