export interface ImageSizeOption {
  key: string;
  ratio: string;
  resolutionPreset: string;
  label: string;
  upstreamSize?: string;
  width?: number;
  height?: number;
  isAuto?: boolean;
}

export interface ImageSizeCapabilityInput {
  tierKey?: string;
  modelName?: string;
  apiModelName?: string;
  upstreamModelCode?: string;
  providerType?: string;
  modelConfig?: any;
  ratios?: string[];
  qualities?: string[];
  maxImages?: number;
}

export interface ImageSizeCapabilityResult {
  ratios: string[];
  resolutionPresets: string[];
  sizeOptions: ImageSizeOption[];
  defaultSizeKey: string;
  maxImages: number;
}

const PRODUCT_RATIOS = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'];
const GPT_IMAGE_2_RATIOS = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'];
const GENERIC_NANO_BANANA_RATIOS = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '9:16', '16:9', '21:9'];
const XIAOMA_NANO_BANANA_PRO_RATIOS = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const XIAOMA_NANO_BANANA_2_RATIOS = [...XIAOMA_NANO_BANANA_PRO_RATIOS, '1:4', '4:1', '1:8', '8:1'];
const GPT_IMAGE_2_RESOLUTIONS = ['auto', '1K', '2K', '4K'];
const XIAOMA_NANO_BANANA_PRO_RESOLUTIONS = ['1K', '2K', '4K'];
const XIAOMA_NANO_BANANA_2_RESOLUTIONS = ['0.5K', '1K', '2K', '4K'];
const PRODUCT_RESOLUTIONS = ['auto', '0.5K', '1K', '2K', '4K'];
const GPT_IMAGE_2_SIZE_MAP: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '3:4': '960x1280',
    '4:3': '1280x960',
    '9:16': '1088x1920',
    '16:9': '1920x1088',
  },
  '2K': {
    '1:1': '2048x2048',
    '2:3': '2048x3072',
    '3:2': '3072x2048',
    '3:4': '1920x2560',
    '4:3': '2560x1920',
    '9:16': '1440x2560',
    '16:9': '2560x1440',
  },
  '4K': {
    '1:1': '2880x2880',
    '2:3': '2304x3456',
    '3:2': '3456x2304',
    '3:4': '2400x3200',
    '4:3': '3200x2400',
    '9:16': '2160x3840',
    '16:9': '3840x2160',
  },
};

export function buildImageSizeCapabilities(input: ImageSizeCapabilityInput): ImageSizeCapabilityResult {
  const config = normalizeObject(input.modelConfig);
  const modelName = [input.modelName, input.apiModelName, input.upstreamModelCode].map((item) => String(item || '')).join(' ');
  const xiaomaNanoProfile = getXiaomaNanoBananaProfile(input.providerType, modelName);
  const explicitOptions = normalizeSizeOptions(config.size_options || config.sizeOptions);
  const shouldUseExplicitOptions = explicitOptions.length > 0
    && (!xiaomaNanoProfile || optionsCoverProfile(explicitOptions, xiaomaNanoProfile));
  const generatedOptions = shouldUseExplicitOptions
    ? explicitOptions
    : generateSizeOptions({
        ratios: chooseRatios(input, config, modelName),
        resolutions: chooseResolutions(input, config, modelName),
        modelName,
      });

  const sizeOptions = uniqueSizeOptions(generatedOptions)
    .filter((item) => PRODUCT_RATIOS.includes(item.ratio))
    .filter((item) => PRODUCT_RESOLUTIONS.includes(item.resolutionPreset));

  const safeOptions = sizeOptions.length ? sizeOptions : fallbackSizeOptions();
  const ratios = uniqueStrings(safeOptions.map((item) => item.ratio));
  const resolutionPresets = uniqueStrings(safeOptions.map((item) => item.resolutionPreset));
  const defaultSizeKey = chooseDefaultSizeKey(safeOptions, config.default_size_key || config.defaultSizeKey, input.tierKey);
  const maxImages = resolveMaxImages(input, config);

  return { ratios, resolutionPresets, sizeOptions: safeOptions, defaultSizeKey, maxImages };
}

export function findImageSizeOption(options: ImageSizeOption[] | undefined, sizeKey?: string, ratio?: string, resolutionPreset?: string): ImageSizeOption | null {
  const list = Array.isArray(options) ? options : [];
  const key = String(sizeKey || '').trim();
  if (key) {
    const byKey = list.find((item) => item.key === key);
    if (byKey) return byKey;
  }
  const normalizedRatio = normalizeRatioPreset(ratio);
  const normalizedResolution = normalizeResolutionPreset(resolutionPreset);
  if (!normalizedRatio && !normalizedResolution) return null;
  return list.find((item) => (
    (!normalizedRatio || item.ratio === normalizedRatio)
    && (!normalizedResolution || item.resolutionPreset === normalizedResolution)
  )) || null;
}

export function normalizeResolutionPreset(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (['auto', 'default'].includes(lower)) return 'auto';
  if (['standard', 'normal', '1k', '1024'].includes(lower)) return '1K';
  if (['hd', '2k', '2048'].includes(lower)) return '2K';
  if (['4k', '4096'].includes(lower)) return '4K';
  if (/^\d+(?:\.\d+)?k$/i.test(text)) return text.toUpperCase();
  return text;
}

export function normalizeRatioPreset(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  const match = text.match(/^(\d{1,4})\s*:\s*(\d{1,4})$/);
  if (!match) return text;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!a || !b) return text;
  const divisor = gcd(a, b);
  return `${a / divisor}:${b / divisor}`;
}

export function isResolutionPreset(value: unknown): boolean {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return ['auto', 'default', 'standard', 'normal', 'hd', '0.5k', '1k', '2k', '4k', '1024', '2048', '4096'].includes(raw);
}

export function resolveGptImage2UpstreamSize(ratio: unknown, resolutionPreset: unknown): string {
  const normalizedRatio = normalizeRatioPreset(ratio);
  const normalizedResolution = normalizeResolutionPreset(resolutionPreset);
  return GPT_IMAGE_2_SIZE_MAP[normalizedResolution]?.[normalizedRatio] || '';
}

function generateSizeOptions(input: { ratios: string[]; resolutions: string[]; modelName?: string }): ImageSizeOption[] {
  const modelName = String(input.modelName || '');
  const isGptImage2 = isGptImage2Model(modelName);
  const isNanoBanana = isNanoBananaModel(modelName);
  const ratios = input.ratios.length ? input.ratios : (isGptImage2 ? GPT_IMAGE_2_RATIOS : isNanoBanana ? GENERIC_NANO_BANANA_RATIOS : ['1:1']);
  const resolutions = input.resolutions.length ? input.resolutions : (isGptImage2 ? GPT_IMAGE_2_RESOLUTIONS : isNanoBanana ? ['1K', '2K', '4K'] : ['1K']);
  const options: ImageSizeOption[] = [];

  if (isGptImage2) {
    options.push({ key: 'auto', ratio: 'auto', resolutionPreset: 'auto', label: '自动', isAuto: true, upstreamSize: 'auto' });
    for (const ratio of ratios) {
      if (ratio === 'auto') continue;
      for (const resolutionPreset of resolutions) {
        if (resolutionPreset === 'auto') continue;
        const upstreamSize = resolveGptImage2UpstreamSize(ratio, resolutionPreset);
        if (!upstreamSize) continue;
        options.push({ ...buildSizeOption(ratio, resolutionPreset), upstreamSize });
      }
    }
    return options;
  }

  for (const ratio of ratios) {
    for (const resolutionPreset of resolutions) {
      if (resolutionPreset === 'auto') continue;
      options.push(buildSizeOption(ratio, resolutionPreset));
    }
  }
  return options;
}

function chooseRatios(input: ImageSizeCapabilityInput, config: Record<string, any>, modelName?: string): string[] {
  const inputRatios = normalizeRatios(input.ratios);
  const xiaomaNanoProfile = getXiaomaNanoBananaProfile(input.providerType, modelName);
  if (xiaomaNanoProfile) {
    return xiaomaNanoProfile.ratios;
  }
  if (isGptImage2Model(modelName)) {
    const configured = normalizeRatios(config.supported_ratios || config.supportedRatios);
    const source = configured.length ? configured : inputRatios;
    const ratios = source.length > 1 ? source : GPT_IMAGE_2_RATIOS;
    return uniqueStrings(['auto', ...ratios]).filter((item) => GPT_IMAGE_2_RATIOS.includes(item));
  }
  if (isNanoBananaModel(modelName)) {
    const source = normalizeRatios(config.supported_ratios).length ? normalizeRatios(config.supported_ratios) : inputRatios;
    const ratios = source.length ? source : GENERIC_NANO_BANANA_RATIOS;
    return uniqueStrings(['auto', ...ratios]).filter((item) => PRODUCT_RATIOS.includes(item));
  }
  return normalizeRatios(config.supported_ratios || input.ratios);
}

function chooseResolutions(input: ImageSizeCapabilityInput, config: Record<string, any>, modelName?: string): string[] {
  const xiaomaNanoProfile = getXiaomaNanoBananaProfile(input.providerType, modelName);
  if (xiaomaNanoProfile) {
    return xiaomaNanoProfile.resolutions;
  }
  if (isGptImage2Model(modelName)) {
    const configured = normalizeResolutionList(config.resolution_presets || config.resolutionPresets);
    const source = configured.length ? configured : GPT_IMAGE_2_RESOLUTIONS;
    return uniqueStrings(['auto', ...source]).filter((item) => PRODUCT_RESOLUTIONS.includes(item));
  }
  if (isNanoBananaModel(modelName)) {
    const configured = normalizeResolutionList(config.resolution_presets || config.resolutionPresets || config.supported_qualities);
    const tierValues = normalizeResolutionList(input.qualities);
    return configured.length ? configured : (tierValues.length ? tierValues : ['1K', '2K', '4K']);
  }
  return normalizeResolutionList(config.resolution_presets || config.resolutionPresets || config.supported_qualities || input.qualities);
}

function normalizeSizeOptions(value: any): ImageSizeOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = normalizeObject(raw);
    const ratio = normalizeRatioPreset(item.ratio || (item.isAuto ? 'auto' : ''));
    const resolutionPreset = normalizeResolutionPreset(item.resolutionPreset || item.resolution || (item.isAuto ? 'auto' : ''));
    if (!ratio || !resolutionPreset) return null;
    const upstreamSize = String(item.upstreamSize || item.size || '').trim() || undefined;
    const key = String(item.key || `${ratio}_${resolutionPreset}`).replace(/\s+/g, '');
    return {
      key,
      ratio,
      resolutionPreset,
      label: String(item.label || buildSizeLabel(ratio, resolutionPreset)),
      upstreamSize,
      width: positiveInt(item.width),
      height: positiveInt(item.height),
      isAuto: Boolean(item.isAuto) || ratio === 'auto' && resolutionPreset === 'auto',
    } as ImageSizeOption;
  }).filter(Boolean) as ImageSizeOption[];
}

function normalizeRatios(value: any): string[] {
  const list = Array.isArray(value) ? value : [];
  return uniqueStrings(list.map(normalizeRatioPreset).filter(Boolean));
}

function normalizeResolutionList(value: any): string[] {
  const list = Array.isArray(value) ? value : [];
  return uniqueStrings(list.map(normalizeResolutionPreset).filter((item) => PRODUCT_RESOLUTIONS.includes(item)));
}

function buildSizeOption(ratio: string, resolutionPreset: string): ImageSizeOption {
  return {
    key: `${ratio}_${resolutionPreset}`,
    ratio,
    resolutionPreset,
    label: buildSizeLabel(ratio, resolutionPreset),
    isAuto: ratio === 'auto' && resolutionPreset === 'auto',
  };
}

function buildSizeLabel(ratio: string, resolutionPreset: string): string {
  if (ratio === 'auto' && resolutionPreset === 'auto') return '自动';
  if (ratio === 'auto') return `${resolutionPreset} 自动`;
  return `${resolutionPreset} ${ratio}`;
}

function uniqueSizeOptions(options: ImageSizeOption[]): ImageSizeOption[] {
  const seen = new Set<string>();
  const result: ImageSizeOption[] = [];
  for (const item of options) {
    const key = item.key || `${item.ratio}_${item.resolutionPreset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, key });
  }
  return result;
}

function fallbackSizeOptions(): ImageSizeOption[] {
  return [
    { key: 'auto', ratio: 'auto', resolutionPreset: 'auto', label: '自动', isAuto: true, upstreamSize: 'auto' },
    buildSizeOption('1:1', '1K'),
  ];
}

function chooseDefaultSizeKey(options: ImageSizeOption[], configured: unknown, tierKey?: string): string {
  const configuredKey = String(configured || '').trim();
  if (configuredKey && options.some((item) => item.key === configuredKey)) return configuredKey;
  const tier = String(tierKey || '').toLowerCase();
  if ((tier.includes('pro') || tier.includes('top')) && options.some((item) => item.key === 'auto_2K')) return 'auto_2K';
  if (options.some((item) => item.key === 'auto')) return 'auto';
  if (options.some((item) => item.key === 'auto_1K')) return 'auto_1K';
  if (options.some((item) => item.key === '1:1_1K')) return '1:1_1K';
  return options[0]?.key || '';
}

function resolveMaxImages(input: ImageSizeCapabilityInput, config: any): number {
  const configured = positiveInt(config.max_images || config.maxImages);
  const tierMax = Math.max(1, positiveInt(input.maxImages) || 1);
  const supportsCount = modelSupportsImageCount(input, config);
  const modelMax = configured || tierMax;
  return supportsCount ? Math.max(1, Math.min(tierMax, modelMax)) : 1;
}

function modelSupportsImageCount(input: ImageSizeCapabilityInput, config: any): boolean {
  if (config.supports_image_count !== undefined) return Boolean(config.supports_image_count);
  if (config.supportsImageCount !== undefined) return Boolean(config.supportsImageCount);
  const providerType = String(input.providerType || '').toLowerCase();
  const names = [input.modelName, input.apiModelName, input.upstreamModelCode].map((item) => String(item || '').toLowerCase());
  if (providerType === 'xiaoma') {
    const params = Array.isArray(config.param_names) ? config.param_names.map((item: any) => String(item).toLowerCase()) : [];
    return params.includes('n') || names.some((item) => isGptImage2Model(item));
  }
  return true;
}

function isGptImage2Model(value: unknown): boolean {
  const text = String(value || '').toLowerCase();
  const compact = text.replace(/[^a-z0-9]/g, '');
  return text.includes('gpt-image-2') || compact.includes('gptimage2');
}

function isNanoBananaModel(value: unknown): boolean {
  const text = String(value || '').toLowerCase();
  const compact = text.replace(/[^a-z0-9]/g, '');
  return text.includes('nano-banana')
    || compact.includes('nanobanana')
    || (text.includes('gemini') && text.includes('image-preview'));
}

function getXiaomaNanoBananaProfile(providerType: unknown, modelName?: string): { ratios: string[]; resolutions: string[] } | null {
  if (String(providerType || '').toLowerCase() !== 'xiaoma') return null;
  const text = String(modelName || '').toLowerCase();
  if (text.includes('gemini-3.1-flash-image-preview')) {
    return { ratios: XIAOMA_NANO_BANANA_2_RATIOS, resolutions: XIAOMA_NANO_BANANA_2_RESOLUTIONS };
  }
  if (text.includes('gemini-3-pro-image-preview')) {
    return { ratios: XIAOMA_NANO_BANANA_PRO_RATIOS, resolutions: XIAOMA_NANO_BANANA_PRO_RESOLUTIONS };
  }
  return null;
}

function optionsCoverProfile(options: ImageSizeOption[], profile: { ratios: string[]; resolutions: string[] }): boolean {
  const keys = new Set(options.map((item) => `${item.ratio}_${item.resolutionPreset}`));
  for (const ratio of profile.ratios) {
    for (const resolutionPreset of profile.resolutions) {
      if (!keys.has(`${ratio}_${resolutionPreset}`)) return false;
    }
  }
  return true;
}

function normalizeObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((item, index) => Boolean(item) && values.indexOf(item) === index);
}

function positiveInt(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
