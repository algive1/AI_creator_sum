import type { Connection, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { decryptApiKey, encryptApiKey } from './openai-adapter.service';

type Executor = Pick<Connection | PoolConnection, 'execute'>;

interface ProviderKeyMapping {
  providerKey: string;
  envKeys: string[];
}

export interface ProviderKeySyncResult {
  providerKey: string;
  envKey: string;
  updated: boolean;
}

const PROVIDER_KEY_MAPPINGS: ProviderKeyMapping[] = [
  { providerKey: 'openai', envKeys: ['OPENAI_API_KEY'] },
  { providerKey: 'xiaoma', envKeys: ['XIAOMA_API_KEY', 'LK888_API_KEY'] },
  { providerKey: 'bagege', envKeys: ['BAGEGE_API_KEY'] },
  { providerKey: 'wellapi', envKeys: ['WELLAPI_API_KEY'] },
  { providerKey: 'codesonline_image', envKeys: ['CODESONLINE_IMAGE_API_KEY', 'CODESONLINE_API_KEY'] },
  { providerKey: 'apimart', envKeys: ['APIMART_API_KEY'] },
];

function usableSecret(value: string | undefined): value is string {
  const text = String(value || '').trim();
  if (!text) return false;
  return !/^(please_replace|please_change|your_|sk-your-|example_|test_)/i.test(text);
}

function firstEnvValue(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key];
    if (usableSecret(value)) return { key, value: value.trim() };
  }
  return null;
}

export async function syncProviderApiKeysFromEnv(executor: Executor): Promise<ProviderKeySyncResult[]> {
  const results: ProviderKeySyncResult[] = [];

  for (const mapping of PROVIDER_KEY_MAPPINGS) {
    const env = firstEnvValue(mapping.envKeys);
    if (!env) continue;

    const [rows] = await executor.execute(
      `SELECT id, api_key
         FROM ai_model_providers
        WHERE provider_key = ? AND deleted_at IS NULL
        LIMIT 1`,
      [mapping.providerKey],
    ) as unknown as [Array<RowDataPacket & { id: number; api_key: string }>, unknown];

    const provider = rows[0];
    if (!provider) {
      results.push({ providerKey: mapping.providerKey, envKey: env.key, updated: false });
      continue;
    }

    if (decryptApiKey(String(provider.api_key || '')).trim() === env.value) {
      results.push({ providerKey: mapping.providerKey, envKey: env.key, updated: false });
      continue;
    }

    const [result] = await executor.execute(
      `UPDATE ai_model_providers
          SET api_key = ?, updated_at = NOW(3)
        WHERE id = ?`,
      [encryptApiKey(env.value), provider.id],
    ) as unknown as [ResultSetHeader, unknown];

    results.push({
      providerKey: mapping.providerKey,
      envKey: env.key,
      updated: Number(result.affectedRows || 0) > 0,
    });
  }

  return results;
}
