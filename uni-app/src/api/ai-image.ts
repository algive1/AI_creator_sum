import { FEATURE_KEYS } from '@/utils/constants';
import { get, post } from './request';

export interface ImageTaskPayload {
  featureKey?: string;
  subType?: 'text2img' | 'img2img' | 'edit';
  prompt: string;
  tierKey?: string;
  tierId?: number;
  sizeMode?: 'auto' | 'ratio' | 'custom_pixels';
  ratio?: string;
  customWidth?: number;
  customHeight?: number;
  style?: string;
  quality?: string;
  scene?: string;
  aiOptimize?: boolean;
  formData?: Record<string, unknown>;
  params?: Record<string, unknown>;
  uploadKeys?: unknown[];
  optimizedPrompt?: string;
  negativePrompt?: string;
  platformWatermarkEnabled?: boolean;
}

export function getImageModels<T = { list: unknown[] }>(featureKey: string = FEATURE_KEYS.image) {
  return get<T>('/public/model-tiers', { feature: featureKey }, { silent: true });
}

export function createImageTask<T = Record<string, unknown>>(payload: ImageTaskPayload) {
  return post<T>('/tasks/image', { ...payload, featureKey: payload.featureKey || FEATURE_KEYS.image }, { loading: '提交生图任务' });
}

export function optimizeImagePrompt<T = Record<string, unknown>>(payload: Record<string, unknown>) {
  return post<T>('/tasks/optimize-prompt', { featureKey: FEATURE_KEYS.image, ...payload }, { loading: '优化提示词' });
}
