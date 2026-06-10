import { query } from '../utils/db';
import { appCache } from '../utils/ttl-cache';

export async function getAvailableModels(): Promise<any[]> {
  return appCache.remember('ai_models:available', 5 * 60 * 1000, () => query<any>(
    `SELECT m.*, p.name AS provider_name, p.provider_type
       FROM ai_models m
       JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE m.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND m.status = 'active'
        AND p.status = 'active'
      ORDER BY m.sort_order DESC, m.id`,
  ));
}

export async function getAdminModelList(): Promise<any[]> {
  return appCache.remember('ai_models:admin_list', 5 * 60 * 1000, () => query<any>(
    `SELECT m.*, p.name AS provider_name, p.provider_type
       FROM ai_models m
       JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY m.sort_order DESC, m.id`,
  ));
}
