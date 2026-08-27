-- Hongniao AI backend-testable image models.
-- Scope: GPT Image 2 and Xiaoma-aligned Nano Banana image parameter models only.
-- This migration does not bind models to public mini-program tiers and does
-- not store any API key. Configure the key in admin or through HONGNIAO_API_KEY.

UPDATE ai_model_providers
   SET provider_type = 'hongniao',
       api_base_url = IF(api_base_url IS NULL OR api_base_url = '', 'https://hongniaoai.com/v1', api_base_url),
       auth_type = 'api_key',
       protocol_type = 'rest',
       default_timeout = GREATEST(COALESCE(default_timeout, 0), 600),
       remark = 'Hongniao async image/video API. Uses X-API-Key. Configure API Key before backend model testing.',
       updated_at = NOW(3)
 WHERE provider_key = 'hongniao' AND deleted_at IS NULL;

SET @hongniao_id := (SELECT id FROM ai_model_providers WHERE provider_key = 'hongniao' AND deleted_at IS NULL LIMIT 1);

DROP TEMPORARY TABLE IF EXISTS tmp_hongniao_image_models;
CREATE TEMPORARY TABLE tmp_hongniao_image_models (
  provider_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  display_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  api_model_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  upstream_model_code VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  points_cost INT NOT NULL,
  sort_order INT NOT NULL,
  config_json JSON NOT NULL,
  remark VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (provider_id, api_model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_hongniao_image_models
  (provider_id, name, display_name, api_model_name, upstream_model_code, points_cost, sort_order, config_json, remark)
SELECT @hongniao_id, 'HongniaoGptImage2', 'Hongniao GPT Image 2', 'gpt-image-2', 'gpt-image-2', 0, 9690,
       JSON_OBJECT(
         'source', 'hongniao_user_api_spec_xiaoma_param_reference',
         'source_checked_at', '2026-06-15',
         'api_format', 'hongniao_image',
         'capabilities', JSON_ARRAY('text_to_image', 'image_to_image'),
         'param_names', JSON_ARRAY('prompt', 'images', 'size', 'n'),
         'supported_ratios', JSON_ARRAY('auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'),
         'supported_qualities', JSON_ARRAY('auto', '1K', '2K', '4K'),
         'resolution_presets', JSON_ARRAY('auto', '1K', '2K', '4K'),
         'default_size_key', 'auto',
         'supports_image_count', TRUE,
         'max_images', 4,
         'min_reference_images', 0,
         'max_reference_images', 4,
         'max_polling_minutes', 20,
         'default_params', JSON_OBJECT('size', 'auto', 'n', 1),
         'endpoints', JSON_OBJECT('create', '/v1/images', 'query', '/api/v1/images/{id}'),
         'description', 'Hongniao GPT Image 2. Parameter mapping follows Xiaoma GPT Image 2: submit size/n only.'
       ),
       'Backend-testable Hongniao GPT Image 2. Not bound to public tiers by this migration.'
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'HongniaoNanoBananaPro', 'Hongniao Nano Banana Pro', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview', 0, 9689,
       JSON_OBJECT(
         'source', 'hongniao_user_api_spec_xiaoma_param_reference',
         'source_checked_at', '2026-06-15',
         'api_format', 'hongniao_image',
         'capabilities', JSON_ARRAY('text_to_image', 'image_to_image'),
         'param_names', JSON_ARRAY('prompt', 'images', 'aspectRatio', 'imageSize'),
         'supported_ratios', JSON_ARRAY('auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'),
         'supported_qualities', JSON_ARRAY('1K', '2K', '4K'),
         'resolution_presets', JSON_ARRAY('1K', '2K', '4K'),
         'default_size_key', 'auto_2K',
         'supports_image_count', FALSE,
         'max_images', 1,
         'min_reference_images', 0,
         'max_reference_images', 4,
         'max_polling_minutes', 20,
         'default_params', JSON_OBJECT('aspectRatio', 'auto', 'imageSize', '2K'),
         'endpoints', JSON_OBJECT('create', '/v1/images', 'query', '/api/v1/images/{id}'),
         'description', 'Hongniao Nano Banana Pro. Parameter mapping follows Xiaoma Nano Banana Pro: submit aspectRatio/imageSize.'
       ),
       'Backend-testable Hongniao Nano Banana Pro. Not bound to public tiers by this migration.'
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'HongniaoNanoBanana2', 'Hongniao Nano Banana 2', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image-preview', 0, 9688,
       JSON_OBJECT(
         'source', 'hongniao_user_api_spec_xiaoma_param_reference',
         'source_checked_at', '2026-06-15',
         'api_format', 'hongniao_image',
         'capabilities', JSON_ARRAY('text_to_image', 'image_to_image'),
         'param_names', JSON_ARRAY('prompt', 'images', 'aspectRatio', 'imageSize', 'thinkingLevel'),
         'supported_ratios', JSON_ARRAY('auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'),
         'supported_qualities', JSON_ARRAY('0.5K', '1K', '2K', '4K'),
         'resolution_presets', JSON_ARRAY('0.5K', '1K', '2K', '4K'),
         'default_size_key', 'auto_1K',
         'supports_image_count', FALSE,
         'max_images', 1,
         'min_reference_images', 0,
         'max_reference_images', 4,
         'max_polling_minutes', 20,
         'default_params', JSON_OBJECT('aspectRatio', 'auto', 'imageSize', '1K', 'thinkingLevel', 'high'),
         'endpoints', JSON_OBJECT('create', '/v1/images', 'query', '/api/v1/images/{id}'),
         'description', 'Hongniao Nano Banana 2. Parameter mapping follows Xiaoma Nano Banana 2: submit aspectRatio/imageSize and thinkingLevel=high.'
       ),
       'Backend-testable Hongniao Nano Banana 2. Not bound to public tiers by this migration.'
 WHERE @hongniao_id IS NOT NULL;

UPDATE ai_models m
JOIN tmp_hongniao_image_models t
  ON t.provider_id = m.provider_id
 AND t.api_model_name COLLATE utf8mb4_unicode_ci = m.api_model_name COLLATE utf8mb4_unicode_ci
   SET m.name = t.name,
       m.display_name = t.display_name,
       m.model_type = 'image',
       m.sub_type = 'text2img',
       m.upstream_model_code = t.upstream_model_code,
       m.is_async = 1,
       m.query_task_url = '/api/v1/images/{id}',
       m.request_template = JSON_OBJECT(),
       m.result_path = '',
       m.status_mapping = JSON_OBJECT('queued', 'queued', 'processing', 'processing', 'completed', 'completed', 'failed', 'failed'),
       m.error_mapping = JSON_OBJECT(),
       m.timeout_seconds = 600,
       m.retry_times = 2,
       m.retry_delay_ms = 5000,
       m.daily_limit = 0,
       m.daily_limit_per_user = 0,
       m.max_concurrency = 2,
       m.priority = 0,
       m.points_cost = t.points_cost,
       m.api_cost_cents = 0,
       m.sort_order = t.sort_order,
       m.config = t.config_json,
       m.remark = t.remark,
       m.status = 'active',
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL;

INSERT INTO ai_models
  (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async,
   query_task_url, request_template, result_path, status_mapping, error_mapping,
   timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user,
   max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
SELECT t.provider_id, t.name, t.display_name, 'image', 'text2img',
       t.api_model_name, t.upstream_model_code, 1,
       '/api/v1/images/{id}', JSON_OBJECT(), '',
       JSON_OBJECT('queued', 'queued', 'processing', 'processing', 'completed', 'completed', 'failed', 'failed'),
       JSON_OBJECT(),
       600, 2, 5000, 0, 0,
       2, 0, t.points_cost, 0, t.sort_order, t.config_json, t.remark, 'active', NOW(3), NOW(3)
  FROM tmp_hongniao_image_models t
 WHERE NOT EXISTS (
   SELECT 1 FROM ai_models m
    WHERE m.provider_id = t.provider_id
      AND m.api_model_name COLLATE utf8mb4_unicode_ci = t.api_model_name COLLATE utf8mb4_unicode_ci
      AND m.deleted_at IS NULL
 );

DROP TEMPORARY TABLE IF EXISTS tmp_hongniao_image_models;
