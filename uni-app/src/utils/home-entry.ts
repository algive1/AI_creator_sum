export type HomeEntryKey = 'image' | 'video' | 'comic';

type HomeEntrySwitch = {
  enabled?: boolean;
  message?: string;
};

const DEFAULT_MESSAGES: Record<HomeEntryKey, string> = {
  image: '生图功能维护中，请稍后再试',
  video: '生视频功能维护中，请稍后再试',
  comic: '生漫剧功能维护中，请稍后再试',
};

export function getHomeEntrySwitch(config: unknown, key: HomeEntryKey): HomeEntrySwitch {
  const root = asRecord(config);
  const switches = asRecord(root.homeEntrySwitches);
  return asRecord(switches[key]) as HomeEntrySwitch;
}

export function isHomeEntryMaintenanceMode(config: unknown, key: HomeEntryKey) {
  return getHomeEntrySwitch(config, key).enabled === false;
}

export function isHomeEntryGenerationAvailable(config: unknown, key: HomeEntryKey) {
  return !isHomeEntryMaintenanceMode(config, key);
}

export function homeEntryDisabledMessage(config: unknown, key: HomeEntryKey) {
  const customMessage = String(getHomeEntrySwitch(config, key).message || '').trim();
  return customMessage || DEFAULT_MESSAGES[key];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
