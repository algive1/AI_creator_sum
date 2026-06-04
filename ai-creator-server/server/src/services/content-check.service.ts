// 敏感词检查服务
import { query } from '../utils/db';

let wordsCache: string[] = [];
let cacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 分钟缓存

export async function checkSensitiveWords(prompt: string): Promise<{ passed: boolean; hitWord?: string }> {
  if (!prompt || typeof prompt !== 'string') return { passed: true };

  const words = await loadWords();
  if (words.length === 0) return { passed: true };

  const lower = prompt.toLowerCase();
  for (const word of words) {
    if (lower.includes(word.toLowerCase())) {
      return { passed: false, hitWord: word };
    }
  }
  return { passed: true };
}

async function loadWords(): Promise<string[]> {
  if (Date.now() - cacheTime < CACHE_TTL_MS && wordsCache.length > 0) {
    return wordsCache;
  }
  const rows = await query<any>('SELECT word FROM content_sensitive_words');
  wordsCache = rows.map((r: any) => String(r.word || '').trim()).filter(Boolean);
  cacheTime = Date.now();
  return wordsCache;
}
