interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async remember<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) return cloneCachedValue(cached.value);

    const value = await loader();
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    return cloneCachedValue(value);
  }

  clear(prefix?: string): void {
    if (!prefix) {
      this.entries.clear();
      return;
    }
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

export const appCache = new TtlCache();

function cloneCachedValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}
