-- Seed WellAPI lowest fixed-price text-to-image model.
-- Source checked: https://wellapi.ai/pricing and https://wellapi.ai/api/pricing_new on 2026-05-31.
-- qwen-image-2.0 is the lowest quota_type=1 image generation model found in pricing_new.
-- The API Key is intentionally not stored here. Admin must configure it in the backend UI.

SET @wellapi_provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'wellapi' AND deleted_at IS NULL);

INSERT INTO ai_model_providers
  (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, remark, status, created_at)
SELECT 'WellAPI', 'wellapi', 'wellapi', 'https://wellapi.ai', '', 120, 3,
       'WellAPI media relay. Includes low-cost pay-per-generation image model and video models.',
       'active', NOW(3)
WHERE @wellapi_provider_exists = 0;

UPDATE ai_model_providers
   SET name = 'WellAPI',
       provider_type = 'wellapi',
       api_base_url = IF(api_base_url IS NULL OR api_base_url = '', 'https://wellapi.ai', api_base_url),
       default_timeout = GREATEST(default_timeout, 120),
       default_retry = IF(default_retry IS NULL OR default_retry = 0, 3, default_retry),
       remark = 'WellAPI media relay. Includes low-cost pay-per-generation image model and video models.',
       updated_at = NOW(3)
 WHERE provider_key = 'wellapi' AND deleted_at IS NULL;

SET @wellapi_id := (SELECT id FROM ai_model_providers WHERE provider_key = 'wellapi' AND deleted_at IS NULL LIMIT 1);

DROP TEMPORARY TABLE IF EXISTS tmp_wellapi_image_models;
CREATE TEMPORARY TABLE tmp_wellapi_image_models (
  provider_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  model_type VARCHAR(16) NOT NULL,
  sub_type VARCHAR(32) NOT NULL,
  api_model_name VARCHAR(64) NOT NULL,
  upstream_model_code VARCHAR(64) NOT NULL,
  timeout_seconds INT NOT NULL,
  retry_times TINYINT NOT NULL,
  retry_delay_ms INT NOT NULL,
  daily_limit INT NOT NULL,
  daily_limit_per_user INT NOT NULL,
  max_concurrency INT NOT NULL,
  priority INT NOT NULL,
  points_cost INT NOT NULL,
  api_cost_cents INT NOT NULL,
  sort_order INT NOT NULL,
  config_json LONGTEXT NOT NULL,
  remark VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL,
  PRIMARY KEY (provider_id, api_model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_wellapi_image_models
(provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, config_json, remark, status)
VALUES
(@wellapi_id, 'WQwenImage20', 'Qwen Image 2.0 生图', 'image', 'text2img', 'qwen-image-2.0', 'qwen-image-2.0', 120, 3, 1000, 0, 0, 5, 0, 2, 1, 6300, '{"source":"wellapi_pricing_new","source_url":"https://wellapi.ai/pricing","source_checked_at":"2026-05-31","api_format":"wellapi_openai_images","endpoint_family":"openai_images","billing":{"quota_type":1,"billing_label":"pay_per_generation","price_yuan":0.013,"pricing_note":"WellAPI pricing_new quota_type=1. Rounded api_cost_cents is 1."},"capabilities":["text_to_image"],"default_params":{"n":1,"size":"1024x1024","response_format":"url"},"supported_ratios":["1:1","16:9","9:16"],"supported_qualities":["1K"],"endpoints":{"create":"/v1/images/generations"},"description":"Lowest fixed-price WellAPI text-to-image model found in pricing_new. Seeded for explicit testing and not bound to production tiers by default."}', 'WellAPI lowest fixed-price pay-per-generation text-to-image model.', 'active');

UPDATE ai_models m
JOIN tmp_wellapi_image_models s
  ON s.provider_id = m.provider_id
 AND s.api_model_name COLLATE utf8mb4_unicode_ci = m.api_model_name COLLATE utf8mb4_unicode_ci
 AND m.deleted_at IS NULL
   SET m.name = s.name,
       m.display_name = s.display_name,
       m.model_type = s.model_type,
       m.sub_type = s.sub_type,
       m.upstream_model_code = s.upstream_model_code,
       m.is_async = 0,
       m.query_task_url = '',
       m.timeout_seconds = s.timeout_seconds,
       m.retry_times = s.retry_times,
       m.retry_delay_ms = s.retry_delay_ms,
       m.daily_limit = s.daily_limit,
       m.daily_limit_per_user = s.daily_limit_per_user,
       m.max_concurrency = s.max_concurrency,
       m.priority = s.priority,
       m.points_cost = s.points_cost,
       m.api_cost_cents = s.api_cost_cents,
       m.sort_order = s.sort_order,
       m.config = s.config_json,
       m.remark = s.remark,
       m.status = s.status,
       m.updated_at = NOW(3);

INSERT INTO ai_models
(provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
SELECT s.provider_id, s.name, s.display_name, s.model_type, s.sub_type, s.api_model_name, s.upstream_model_code, 0,
       '', '{"response_format":"url"}', '', '{}', '{}', s.timeout_seconds, s.retry_times, s.retry_delay_ms,
       s.daily_limit, s.daily_limit_per_user, s.max_concurrency, s.priority, s.points_cost, s.api_cost_cents,
       s.sort_order, s.config_json, s.remark, s.status, NOW(3), NOW(3)
  FROM tmp_wellapi_image_models s
 WHERE NOT EXISTS (
   SELECT 1 FROM ai_models m
    WHERE m.provider_id = s.provider_id
      AND m.api_model_name COLLATE utf8mb4_unicode_ci = s.api_model_name COLLATE utf8mb4_unicode_ci
      AND m.deleted_at IS NULL
 );

DROP TEMPORARY TABLE IF EXISTS tmp_wellapi_image_models;
