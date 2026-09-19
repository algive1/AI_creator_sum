export interface PersistentCacheEntry<T> {
  data: T;
  savedAt: number;
}

export function readPersistentCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = uni.getStorageSync(key) as PersistentCacheEntry<T> | null;
    if (!raw || typeof raw !== 'object') return null;
    const savedAt = Number(raw.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > maxAgeMs) {
      uni.removeStorageSync(key);
      return null;
    }
    return raw.data ?? null;
  } catch {
    return null;
  }
}

export function writePersistentCache<T>(key: string, data: T) {
  try {
    uni.setStorageSync(key, { data, savedAt: Date.now() } satisfies PersistentCacheEntry<T>);
  } catch {
    // Storage pressure must never break creation flows.
  }
}
