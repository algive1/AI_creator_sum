import { get, post } from './request';

export type ToolKey =
  | 'prompt_reverse'
  | 'grid_cut'
  | 'image_compress'
  | 'watermark'
  | 'compare'
  | 'cutout'
  | 'resize'
  | 'phone_frame';

export interface ToolItem {
  key: ToolKey;
  title: string;
  description: string;
  icon: string;
  category: 'ai' | 'image';
  enabled: boolean;
  memberDailyQuota: number;
  guestDailyQuota: number;
  adUnlockEnabled: boolean;
  pointsEnabled: boolean;
  pointsCost: number;
  message?: string;
}

export interface ToolsConfig {
  enabled: boolean;
  tools: ToolItem[];
  usage: Record<string, { usedToday: number; freeQuota: number; remainingFree: number; unlocked: boolean }>;
  adUnitId: string;
  bannerAdUnitId: string;
}

export interface ToolOutput {
  fileId: number;
  fileNo: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
}

export interface ToolProcessResult {
  toolKey: ToolKey;
  outputs: ToolOutput[];
  prompt?: string;
  usageSource: string;
  pointsCost: number;
}

export function getToolsConfig() {
  return get<ToolsConfig>('/tools/config', undefined, { silent: true });
}

export function createToolAdSession(toolKey: ToolKey) {
  return post<{ sessionId: string; adUnitId: string; expiresAt: string | null }>('/tools/ad-session', { toolKey });
}

export function claimToolAdUnlock(toolKey: ToolKey, sessionId: string, completed = true) {
  return post<{ unlocked: boolean; status: string; message: string }>('/tools/ad-unlock', { toolKey, sessionId, completed });
}

export function processTool(payload: { toolKey: ToolKey; fileIds: number[]; params?: Record<string, unknown> }) {
  return post<ToolProcessResult>('/tools/process', payload, { loading: '处理中', dedupe: false, timeout: 180_000 });
}
