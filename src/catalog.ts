export interface CatalogModel {
  name: string;
  aliases: string[];
  hfId: string;
  displayName: string;
  params: string;
  quant: string;
  sizeBytes: number;
  sizeHuman: string;
  minRamGB: number;
  family: string;
  instructionTuned: boolean;
  multimodal: boolean;
  reasoning: boolean;
}

const CATALOG: CatalogModel[] = [
  {
    name: 'gemma-3-4b-it-4bit',
    aliases: ['gemma3:4b', 'gemma3:4b-it-q4'],
    hfId: 'mlx-community/gemma-3-4b-it-4bit',
    displayName: 'Gemma 3 4B Instruct (4-bit)',
    params: '4B',
    quant: '4-bit',
    sizeBytes: 2_457_600_000,
    sizeHuman: '2.3 GB',
    minRamGB: 8,
    family: 'gemma',
    instructionTuned: true,
    multimodal: false,
    reasoning: false,
  },
  {
    name: 'qwen3-4b-4bit',
    aliases: ['qwen3:4b', 'qwen3:4b-q4'],
    hfId: 'mlx-community/Qwen3-4B-Instruct-2507-4bit',
    displayName: 'Qwen 3 4B Instruct (4-bit)',
    params: '4B',
    quant: '4-bit',
    sizeBytes: 2_400_000_000,
    sizeHuman: '2.4 GB',
    minRamGB: 8,
    family: 'qwen',
    instructionTuned: true,
    multimodal: false,
    reasoning: true,
  },
  {
    name: 'llama-3.2-3b-it-4bit',
    aliases: ['llama3.2:3b', 'llama3.2:3b-q4'],
    hfId: 'mlx-community/Llama-3.2-3B-Instruct-4bit',
    displayName: 'Llama 3.2 3B Instruct (4-bit)',
    params: '3B',
    quant: '4-bit',
    sizeBytes: 1_800_000_000,
    sizeHuman: '1.8 GB',
    minRamGB: 8,
    family: 'llama',
    instructionTuned: true,
    multimodal: false,
    reasoning: false,
  },
  {
    name: 'deepseek-r1-7b-4bit',
    aliases: ['deepseek-r1:7b', 'deepseek-r1:7b-q4'],
    hfId: 'mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit',
    displayName: 'DeepSeek R1 Distill Qwen 7B (4-bit)',
    params: '7B',
    quant: '4-bit',
    sizeBytes: 4_100_000_000,
    sizeHuman: '4.1 GB',
    minRamGB: 12,
    family: 'deepseek',
    instructionTuned: true,
    multimodal: false,
    reasoning: true,
  },
  {
    name: 'phi-4-4bit',
    aliases: ['phi4:14b', 'phi4:14b-q4'],
    hfId: 'mlx-community/phi-4-4bit',
    displayName: 'Phi 4 (4-bit)',
    params: '14B',
    quant: '4-bit',
    sizeBytes: 8_400_000_000,
    sizeHuman: '8.4 GB',
    minRamGB: 16,
    family: 'phi',
    instructionTuned: true,
    multimodal: false,
    reasoning: false,
  },
  {
    name: 'qwen2.5-7b-4bit',
    aliases: ['qwen2.5:7b', 'qwen2.5:7b-q4'],
    hfId: 'mlx-community/Qwen2.5-7B-Instruct-4bit',
    displayName: 'Qwen 2.5 7B Instruct (4-bit)',
    params: '7B',
    quant: '4-bit',
    sizeBytes: 4_300_000_000,
    sizeHuman: '4.3 GB',
    minRamGB: 12,
    family: 'qwen',
    instructionTuned: true,
    multimodal: false,
    reasoning: false,
  },
  {
    name: 'llama-3.1-8b-4bit',
    aliases: ['llama3.1:8b', 'llama3.1:8b-q4'],
    hfId: 'mlx-community/Meta-Llama-3.1-8B-Instruct-4bit',
    displayName: 'Llama 3.1 8B Instruct (4-bit)',
    params: '8B',
    quant: '4-bit',
    sizeBytes: 4_900_000_000,
    sizeHuman: '4.9 GB',
    minRamGB: 12,
    family: 'llama',
    instructionTuned: true,
    multimodal: false,
    reasoning: false,
  },
  {
    name: 'gemma-4-26b-4bit',
    aliases: ['gemma4:e4b', 'gemma4:26b', 'gemma4:26b-q4'],
    hfId: 'mlx-community/gemma-4-26b-a4b-it-4bit',
    displayName: 'Gemma 4 26B (4-bit)',
    params: '26B',
    quant: '4-bit',
    sizeBytes: 15_000_000_000,
    sizeHuman: '15 GB',
    minRamGB: 32,
    family: 'gemma',
    instructionTuned: true,
    multimodal: false,
    reasoning: false,
  },
];

export function getCatalog(): CatalogModel[] {
  return [...CATALOG];
}

export function getDefaultModel(): CatalogModel {
  return CATALOG[0];
}

export function findCatalogModel(name: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.name === name || m.aliases.includes(name));
}

export function findCatalogModelByHfId(hfId: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.hfId === hfId);
}

export function findCatalogModelByFamily(family: string, params: string): CatalogModel | undefined {
  const normalizedParams = params.toUpperCase().replace(/B$/, '').replace(/^(\d+)$/, '$1');
  const match = CATALOG.find((m) => {
    if (m.family !== family) return false;
    const mParams = m.params.toUpperCase().replace(/B$/, '');
    return mParams === normalizedParams;
  });
  if (match) return match;
  return CATALOG.find((m) => m.family === family);
}

export function findCatalogModelByAlias(ollamaName: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.aliases.includes(ollamaName));
}

export function filterCatalogByRam(catalog: CatalogModel[], availableRamGB: number): CatalogModel[] {
  return catalog.filter((m) => m.minRamGB <= availableRamGB);
}
