import type { Connection, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type Executor = Pick<Connection | PoolConnection, 'execute'>;

interface EnvConfigMapping {
  configKey: string;
  envKeys: string[];
  group: string;
  valueType: string;
}

export interface DeploymentConfigSyncResult {
  configKey: string;
  envKey: string;
  updated: boolean;
}

const DEPLOYMENT_CONFIG_MAPPINGS: EnvConfigMapping[] = [
  {
    configKey: 'storage.local.base_url',
    envKeys: ['LOCAL_BASE_URL'],
    group: 'storage',
    valueType: 'string',
  },
];

function isPlaceholder(value: string): boolean {
  return /please_replace|your[-_]|example\.com/i.test(value);
}

function usableLocalBaseUrl(value: string | undefined): value is string {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text || isPlaceholder(text)) return false;
  return /^https:\/\//i.test(text);
}

function firstEnvValue(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key];
    if (usableLocalBaseUrl(value)) {
      return { key, value: String(value).trim().replace(/\/+$/, '') };
    }
  }
  return null;
}

function shouldUpdateCurrentValue(value: string): boolean {
  const current = value.trim().replace(/\/+$/, '');
  return !current || current === '/static' || isPlaceholder(current);
}

export async function syncDeploymentConfigsFromEnv(executor: Executor): Promise<DeploymentConfigSyncResult[]> {
  const results: DeploymentConfigSyncResult[] = [];

  for (const mapping of DEPLOYMENT_CONFIG_MAPPINGS) {
    const env = firstEnvValue(mapping.envKeys);
    if (!env) continue;

    const [rows] = await executor.execute(
      `SELECT config_value
         FROM system_configs
        WHERE config_key = ?
        LIMIT 1`,
      [mapping.configKey],
    ) as unknown as [Array<RowDataPacket & { config_value: string }>, unknown];

    const currentValue = String(rows[0]?.config_value || '');
    if (currentValue.trim().replace(/\/+$/, '') === env.value || !shouldUpdateCurrentValue(currentValue)) {
      results.push({ configKey: mapping.configKey, envKey: env.key, updated: false });
      continue;
    }

    const [result] = await executor.execute(
      `INSERT INTO system_configs
          (config_key, config_value, value_type, config_group, is_secret, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, '', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
          config_value = VALUES(config_value),
          value_type = VALUES(value_type),
          config_group = VALUES(config_group),
          is_secret = 0,
          updated_at = NOW(3)`,
      [mapping.configKey, env.value, mapping.valueType, mapping.group],
    ) as unknown as [ResultSetHeader, unknown];

    results.push({
      configKey: mapping.configKey,
      envKey: env.key,
      updated: Number(result.affectedRows || 0) > 0,
    });
  }

  return results;
}
