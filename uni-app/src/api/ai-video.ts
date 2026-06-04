import { FEATURE_KEYS } from '@/utils/constants';
import { get, post } from './request';

export interface VideoTaskPayload {
  featureKey?: string;
  subType?: 'text2video' | 'img2video' | 'first_last_frame' | 'video_edit' | string;
  videoMode?: string;
  prompt: string;
  tierKey?: string;
  tierId?: number;
  firstFrameFileId?: number;
  lastFrameFileId?: number;
  videoFileId?: number;
  videoId?: number;
  videoUrl?: string;
  sizeMode?: 'auto' | 'ratio' | 'custom_pixels';
  ratio?: string;
  customWidth?: number;
  customHeight?: number;
  duration?: string;
  audioMode?: string;
  style?: string;
  quality?: string;
  aiOptimize?: boolean;
  autoScript?: boolean;
  formData?: Record<string, unknown>;
  params?: {
    resolution?: string;
    preserveAudio?: boolean;
    inputAssets?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  uploadKeys?: unknown[];
  optimizedPrompt?: string;
  negativePrompt?: string;
}

export function getVideoModels<T = { list: unknown[] }>(featureKey: string = FEATURE_KEYS.video) {
  return get<T>('/public/model-tiers', { feature: featureKey }, { silent: true });
}

export function createVideoTask<T = Record<string, unknown>>(payload: VideoTaskPayload) {
  return post<T>('/tasks/video', { ...payload, featureKey: payload.featureKey || FEATURE_KEYS.video }, { loading: '提交视频任务' });
}

export function optimizeVideoPrompt<T = Record<string, unknown>>(payload: Record<string, unknown>) {
  return post<T>('/tasks/optimize-prompt', { featureKey: FEATURE_KEYS.video, ...payload }, { loading: '优化提示词' });
}
