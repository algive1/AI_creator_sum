-- Clean up legacy soft-deleted rows for the strict provider scope. Keep the
-- historical snapshot before physical deletion so task/cost history remains
-- readable without retaining an unusable model in ai_models.
DROP TEMPORARY TABLE IF EXISTS tmp_legacy_provider_models;
CREATE TEMPORARY TABLE tmp_legacy_provider_models (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO tmp_legacy_provider_models (id)
SELECT m.id
  FROM ai_models m
  JOIN ai_model_providers p ON p.id = m.provider_id
 WHERE p.provider_key IN ('xiaoma', 'hongniao', 'agnes_ai')
   AND m.deleted_at IS NOT NULL;

INSERT IGNORE INTO ai_model_catalog_archive
  (provider_id, original_model_id, name, display_name, model_type, sub_type,
   api_model_name, upstream_model_code, is_async, query_task_url, request_template,
   result_path, status_mapping, error_mapping, timeout_seconds, retry_times,
   retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority,
   points_cost, api_cost_cents, sort_order, config, remark, archived_at)
SELECT m.provider_id, m.id, COALESCE(m.name, m.api_model_name), COALESCE(m.display_name, m.name, m.api_model_name),
       COALESCE(m.model_type, 'unknown'), COALESCE(m.sub_type, ''), m.api_model_name,
       COALESCE(m.upstream_model_code, ''), COALESCE(m.is_async, 0), COALESCE(m.query_task_url, ''),
       COALESCE(m.request_template, JSON_OBJECT()), COALESCE(m.result_path, ''),
       COALESCE(m.status_mapping, JSON_OBJECT()), COALESCE(m.error_mapping, JSON_OBJECT()),
       COALESCE(m.timeout_seconds, 120), COALESCE(m.retry_times, 3), COALESCE(m.retry_delay_ms, 1000),
       COALESCE(m.daily_limit, 0), COALESCE(m.daily_limit_per_user, 0), COALESCE(m.max_concurrency, 5),
       COALESCE(m.priority, 0), COALESCE(m.points_cost, 0), COALESCE(m.api_cost_cents, 0), COALESCE(m.sort_order, 0),
       COALESCE(m.config, JSON_OBJECT()), COALESCE(m.remark, ''), NOW(3)
  FROM ai_models m
  JOIN tmp_legacy_provider_models x ON x.id = m.id;

DELETE b FROM tier_model_bindings b JOIN tmp_legacy_provider_models x ON x.id = b.model_id;
DELETE r FROM ai_model_fallback_rules r JOIN tmp_legacy_provider_models x ON x.id = r.model_id;
DELETE r FROM ai_model_fallback_rules r JOIN tmp_legacy_provider_models x ON x.id = r.fallback_model_id;
UPDATE ai_models m
JOIN tmp_legacy_provider_models x ON x.id = m.fallback_model_id
   SET m.fallback_model_id = NULL;
DELETE c FROM ai_model_capabilities c JOIN tmp_legacy_provider_models x ON x.id = c.model_id;
DELETE p FROM ai_model_price_rules p JOIN tmp_legacy_provider_models x ON x.id = p.model_id;
DELETE m FROM ai_models m JOIN tmp_legacy_provider_models x ON x.id = m.id;

DROP TEMPORARY TABLE IF EXISTS tmp_legacy_provider_models;
