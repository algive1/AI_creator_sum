-- Hongniao AI video provider and public mini-program tiers.
-- Model metadata was refreshed from GET https://hongniaoai.com/v1/models on
-- 2026-06-17. This migration does not store any plaintext API key.

SET @provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'hongniao' AND deleted_at IS NULL);

INSERT INTO ai_model_providers
  (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, auth_type, protocol_type, remark, status, created_at, updated_at)
SELECT 'Hongniao AI', 'hongniao', 'hongniao', 'https://hongniaoai.com/v1', '', 600, 2, 'api_key', 'rest',
       'Hongniao async video API. Uses X-API-Key. Configure API Key in admin or HONGNIAO_API_KEY.',
       'active', NOW(3), NOW(3)
WHERE @provider_exists = 0;

UPDATE ai_model_providers
   SET name = 'Hongniao AI',
       provider_type = 'hongniao',
       api_base_url = 'https://hongniaoai.com/v1',
       auth_type = 'api_key',
       protocol_type = 'rest',
       default_timeout = GREATEST(COALESCE(default_timeout, 0), 600),
       default_retry = IF(default_retry IS NULL OR default_retry = 0, 2, default_retry),
       remark = 'Hongniao async image/video API. Uses X-API-Key. Configure API Key in admin or HONGNIAO_API_KEY.',
       status = IF(status IS NULL OR status = '', 'active', status),
       updated_at = NOW(3)
 WHERE provider_key = 'hongniao' AND deleted_at IS NULL;

SET @hongniao_id := (SELECT id FROM ai_model_providers WHERE provider_key = 'hongniao' AND deleted_at IS NULL LIMIT 1);

DROP TEMPORARY TABLE IF EXISTS tmp_hongniao_video_models;
CREATE TEMPORARY TABLE tmp_hongniao_video_models (
  provider_id BIGINT UNSIGNED NOT NULL,
  feature_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  tier_key VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  tier_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  display_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  api_model_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  sub_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  task_kind VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  capabilities JSON NOT NULL,
  param_names JSON NOT NULL,
  ratios JSON NOT NULL,
  native_sizes JSON NOT NULL,
  qualities JSON NOT NULL,
  durations JSON NOT NULL,
  audio_modes JSON NOT NULL,
  default_audio_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'silent',
  default_ratio VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  default_seconds VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  default_resolution VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  input_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  reference_upload_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  min_reference_images INT NOT NULL,
  max_reference_images INT NOT NULL,
  max_audio_urls INT NOT NULL DEFAULT 0,
  max_video_urls INT NOT NULL DEFAULT 0,
  points_cost INT NOT NULL,
  api_cost_cents INT NOT NULL,
  price_yuan DECIMAL(10,2) NOT NULL,
  sort_order INT NOT NULL,
  PRIMARY KEY (provider_id, api_model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_hongniao_video_models
  (provider_id, feature_key, tier_key, tier_name, display_name, api_model_name, sub_type, task_kind, capabilities, param_names,
   ratios, native_sizes, qualities, durations, audio_modes, default_audio_mode, default_ratio, default_seconds, default_resolution,
   input_mode, reference_upload_mode, min_reference_images, max_reference_images, max_audio_urls, max_video_urls,
   points_cost, api_cost_cents, price_yuan, sort_order)
SELECT @hongniao_id, 'image_to_video', 'hongniao_grok_video_10', '红鸟 Grok 1.0 参考视频', 'Hongniao Grok Video 1.0',
       'zh-grok-video-1.0', 'image_to_video', 'video.generate',
       JSON_ARRAY('image_to_video'), JSON_ARRAY('prompt','seconds','aspectRatio','images'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('6s','10s'), JSON_ARRAY(), 'silent', '16:9', '6', NULL,
       'reference_images', 'reference_images', 1, 3, 0, 0, 4, 40, 0.40, 8810
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'image_to_video', 'hongniao_grok_video_15', '红鸟 Grok 1.5 首图视频', 'Hongniao Grok Video 1.5',
       'zh-grok-video-1.5', 'image_to_video', 'video.image_to_video',
       JSON_ARRAY('image_to_video'), JSON_ARRAY('prompt','aspectRatio','seconds','images'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY('1280x720','720x1280'), JSON_ARRAY(), JSON_ARRAY('6s','10s','15s'), JSON_ARRAY(), 'silent', '9:16', '6', NULL,
       'first_frame', 'first_frame', 1, 1, 0, 0, 4, 40, 0.40, 8811
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'image_to_video', 'hongniao_sdquan2_reference', '红鸟 SDQuan 2 参考视频', 'Hongniao SDQuan 2',
       'sdquan-2', 'image_to_video', 'video.generate',
       JSON_ARRAY('text_to_video','image_to_video'), JSON_ARRAY('prompt','aspectRatio','images','seconds','audioUrls','resolution'),
       JSON_ARRAY('16:9','9:16','4:3','3:4','1:1','21:9'), JSON_ARRAY(), JSON_ARRAY('720p'), JSON_ARRAY('15s'), JSON_ARRAY('audio','silent'), 'audio', '9:16', '15', '720p',
       'reference_images', 'reference_images', 0, 9, 3, 0, 58, 580, 5.80, 8812
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'image_to_video', 'hongniao_xb_sora2_first_frame', '红鸟 Sora2 首图视频', 'Hongniao XB Sora2',
       'xb-sora2', 'image_to_video', 'video.generate',
       JSON_ARRAY('image_to_video'), JSON_ARRAY('prompt','seconds','images','aspectRatio'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('8s','12s'), JSON_ARRAY(), 'silent', '16:9', '12', NULL,
       'first_frame', 'first_frame', 1, 1, 0, 0, 6, 60, 0.60, 8813
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'video_create', 'hongniao_sora2z_video', '红鸟 Sora 2-Z', 'Hongniao Sora 2-Z',
       'sora-2-z', 'text_to_video', 'video.generate',
       JSON_ARRAY('text_to_video','image_to_video'), JSON_ARRAY('prompt','aspectRatio','seconds','images'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('12s'), JSON_ARRAY(), 'silent', '16:9', '12', NULL,
       'text', 'none', 0, 1, 0, 0, 7, 70, 0.70, 8814
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'image_to_video', 'hongniao_veo_omni_flash', '红鸟 Veo Omni Flash', 'Hongniao Veo Omni Flash',
       'veo-omni-flash', 'image_to_video', 'video.generate',
       JSON_ARRAY('image_to_video'), JSON_ARRAY('prompt','seconds','images','aspectRatio'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('10s'), JSON_ARRAY(), 'silent', '9:16', '10', NULL,
       'reference_images', 'reference_images', 1, 6, 0, 0, 7, 70, 0.70, 8815
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'first_last_frame_video', 'hongniao_p_weo31_first_last', '红鸟 P-weo3.1 首尾帧', 'Hongniao P-weo3.1',
       'P-weo3.1', 'first_last_frame_video', 'video.first_last_frame_to_video',
       JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'), JSON_ARRAY('prompt','aspectRatio','seconds','images'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('8s'), JSON_ARRAY(), 'silent', '9:16', '8', NULL,
       'first_last', 'first_last', 0, 2, 0, 0, 4, 40, 0.40, 8816
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'first_last_frame_video', 'hongniao_veo31_xs_first_last', '红鸟 Veo 3.1 XS 首尾帧', 'Hongniao Veo 3.1 XS',
       'veo_3_1-xs', 'first_last_frame_video', 'video.generate',
       JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'), JSON_ARRAY('prompt','seconds','images','aspectRatio'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY('1280x720','720x1280'), JSON_ARRAY(), JSON_ARRAY('8s'), JSON_ARRAY(), 'silent', '16:9', '8', NULL,
       'first_last', 'first_last', 0, 2, 0, 0, 3, 30, 0.30, 8817
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'image_to_video', 'hongniao_kuaile_reference', '红鸟 快乐 1.0 参考视频', 'Hongniao Kuaile 1.0',
       'me-kuaile1.0', 'image_to_video', 'video.generate',
       JSON_ARRAY('text_to_video','image_to_video'), JSON_ARRAY('prompt','aspectRatio','resolution','images','seconds'),
       JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'), JSON_ARRAY(), JSON_ARRAY('720P','1080P'), JSON_ARRAY('5s','10s','15s'), JSON_ARRAY(), 'silent', '9:16', '15', '1080P',
       'reference_images', 'reference_images', 0, 5, 0, 0, 15, 150, 1.50, 8818
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'image_to_video', 'hongniao_quanneng_j_reference', '红鸟 全能 J 参考视频', 'Hongniao Quanneng J',
       'quanneng-j', 'image_to_video', 'video.generate',
       JSON_ARRAY('text_to_video','image_to_video','video_edit'), JSON_ARRAY('prompt','seconds','aspectRatio','images','audioUrls','videoUrls'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('15s'), JSON_ARRAY('audio','silent'), 'audio', '16:9', '15', NULL,
       'reference_images', 'reference_images', 0, 9, 3, 3, 32, 320, 3.20, 8819
 WHERE @hongniao_id IS NOT NULL
UNION ALL
SELECT @hongniao_id, 'video_edit', 'hongniao_quanneng20_video_edit', '红鸟 全能 2.0 视频参考', 'Hongniao Quanneng 2.0',
       'quanneng2.0', 'video_edit', 'video.generate',
       JSON_ARRAY('text_to_video','image_to_video','video_edit'), JSON_ARRAY('prompt','aspectRatio','images','seconds','audioUrls','videoUrls'),
       JSON_ARRAY('16:9','9:16'), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('5s','10s','15s'), JSON_ARRAY('audio','silent'), 'audio', '16:9', '15', NULL,
       'source_video', 'source_video', 0, 4, 3, 1, 28, 280, 2.80, 8820
 WHERE @hongniao_id IS NOT NULL;

UPDATE ai_models m
JOIN tmp_hongniao_video_models x
  ON x.provider_id = m.provider_id
 AND x.api_model_name COLLATE utf8mb4_unicode_ci = m.api_model_name COLLATE utf8mb4_unicode_ci
   SET m.name = CONCAT('Hongniao-', x.api_model_name),
       m.display_name = x.display_name,
       m.model_type = 'video',
       m.sub_type = x.sub_type,
       m.upstream_model_code = x.api_model_name,
       m.is_async = 1,
       m.query_task_url = '/api/v1/videos/{id}',
       m.request_template = JSON_OBJECT(),
       m.result_path = '',
       m.status_mapping = JSON_OBJECT('queued','queued','processing','processing','completed','completed','failed','failed'),
       m.error_mapping = JSON_OBJECT(),
       m.timeout_seconds = 600,
       m.retry_times = 2,
       m.retry_delay_ms = 5000,
       m.daily_limit = 0,
       m.daily_limit_per_user = 0,
       m.max_concurrency = 2,
       m.priority = 0,
       m.points_cost = x.points_cost,
       m.api_cost_cents = x.api_cost_cents,
       m.sort_order = x.sort_order,
       m.config = JSON_OBJECT(
         'source', 'hongniao_models_api',
         'source_checked_at', '2026-06-17',
         'api_format', 'hongniao_video',
         'task_kind', x.task_kind,
         'capabilities', x.capabilities,
         'param_names', x.param_names,
         'supported_ratios', x.ratios,
         'native_sizes', x.native_sizes,
         'supported_qualities', x.qualities,
         'supported_durations', x.durations,
         'supported_audio_modes', x.audio_modes,
         'default_audio_mode', x.default_audio_mode,
         'supported_size_modes', JSON_ARRAY('ratio'),
         'input_mode', x.input_mode,
         'reference_upload_mode', x.reference_upload_mode,
         'min_reference_images', x.min_reference_images,
         'max_reference_images', x.max_reference_images,
         'max_audio_urls', x.max_audio_urls,
         'max_video_urls', x.max_video_urls,
         'max_polling_minutes', 20,
         'billing', JSON_OBJECT('type','per_call','amount',x.price_yuan,'currency','CNY'),
         'default_params', JSON_OBJECT('aspectRatio', x.default_ratio, 'seconds', x.default_seconds, 'resolution', x.default_resolution),
         'endpoints', JSON_OBJECT('create','/v1/videos','query','/api/v1/videos/{id}')
       ),
       m.remark = 'Hongniao video model refreshed from /v1/models. Uses POST /v1/videos and GET /api/v1/videos/{id}.',
       m.status = 'active',
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL;

INSERT INTO ai_models
  (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async,
   query_task_url, request_template, result_path, status_mapping, error_mapping,
   timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user,
   max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
SELECT x.provider_id, CONCAT('Hongniao-', x.api_model_name), x.display_name, 'video', x.sub_type,
       x.api_model_name, x.api_model_name, 1,
       '/api/v1/videos/{id}', JSON_OBJECT(), '',
       JSON_OBJECT('queued','queued','processing','processing','completed','completed','failed','failed'), JSON_OBJECT(),
       600, 2, 5000, 0, 0,
       2, 0, x.points_cost, x.api_cost_cents, x.sort_order,
       JSON_OBJECT(
         'source', 'hongniao_models_api',
         'source_checked_at', '2026-06-17',
         'api_format', 'hongniao_video',
         'task_kind', x.task_kind,
         'capabilities', x.capabilities,
         'param_names', x.param_names,
         'supported_ratios', x.ratios,
         'native_sizes', x.native_sizes,
         'supported_qualities', x.qualities,
         'supported_durations', x.durations,
         'supported_audio_modes', x.audio_modes,
         'default_audio_mode', x.default_audio_mode,
         'supported_size_modes', JSON_ARRAY('ratio'),
         'input_mode', x.input_mode,
         'reference_upload_mode', x.reference_upload_mode,
         'min_reference_images', x.min_reference_images,
         'max_reference_images', x.max_reference_images,
         'max_audio_urls', x.max_audio_urls,
         'max_video_urls', x.max_video_urls,
         'max_polling_minutes', 20,
         'billing', JSON_OBJECT('type','per_call','amount',x.price_yuan,'currency','CNY'),
         'default_params', JSON_OBJECT('aspectRatio', x.default_ratio, 'seconds', x.default_seconds, 'resolution', x.default_resolution),
         'endpoints', JSON_OBJECT('create','/v1/videos','query','/api/v1/videos/{id}')
       ),
       'Hongniao video model refreshed from /v1/models. Uses POST /v1/videos and GET /api/v1/videos/{id}.',
       'active', NOW(3), NOW(3)
  FROM tmp_hongniao_video_models x
 WHERE NOT EXISTS (
   SELECT 1 FROM ai_models m
    WHERE m.provider_id = x.provider_id
      AND m.api_model_name COLLATE utf8mb4_unicode_ci = x.api_model_name COLLATE utf8mb4_unicode_ci
      AND m.deleted_at IS NULL
 );

INSERT INTO model_tiers
  (feature_id, tier_name, tier_key, description, tag, points_cost, pricing_mode, pricing_rules, is_default, is_recommended, sort_order, status, created_at, updated_at)
SELECT f.id, x.tier_name, x.tier_key,
       CONCAT(x.display_name, '，红鸟专属视频模型；按模型参数下发比例、分辨率、时长和上传能力。'),
       '', x.points_cost, 'fixed', NULL, 0, 0, x.sort_order, 'active', NOW(3), NOW(3)
  FROM tmp_hongniao_video_models x
  JOIN model_features f ON f.feature_key = x.feature_key COLLATE utf8mb4_unicode_ci
 WHERE x.provider_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  tier_name = VALUES(tier_name),
  description = VALUES(description),
  tag = '',
  points_cost = VALUES(points_cost),
  pricing_mode = VALUES(pricing_mode),
  pricing_rules = VALUES(pricing_rules),
  sort_order = VALUES(sort_order),
  status = 'active',
  updated_at = NOW(3);

INSERT INTO tier_capabilities
  (tier_id, supported_ratios, supported_qualities, supported_durations, supported_audio_modes, default_audio_mode,
   supported_size_modes, native_sizes, default_ratio, allow_postprocess, postprocess_modes, max_images, max_reference_images,
   input_mode, reference_upload_mode, min_reference_images, required_reference, max_duration_seconds)
SELECT t.id, x.ratios, x.qualities, x.durations, x.audio_modes, x.default_audio_mode,
       JSON_ARRAY('ratio'), x.native_sizes, x.default_ratio, 0, JSON_ARRAY(), x.max_reference_images, x.max_reference_images,
       x.input_mode, x.reference_upload_mode, x.min_reference_images, CASE WHEN x.min_reference_images > 0 THEN 1 ELSE 0 END,
       CAST(x.default_seconds AS UNSIGNED)
  FROM tmp_hongniao_video_models x
  JOIN model_tiers t ON t.tier_key = x.tier_key COLLATE utf8mb4_unicode_ci
 WHERE x.provider_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_durations = VALUES(supported_durations),
  supported_audio_modes = VALUES(supported_audio_modes),
  default_audio_mode = VALUES(default_audio_mode),
  supported_size_modes = VALUES(supported_size_modes),
  native_sizes = VALUES(native_sizes),
  default_ratio = VALUES(default_ratio),
  max_images = VALUES(max_images),
  max_reference_images = VALUES(max_reference_images),
  input_mode = VALUES(input_mode),
  reference_upload_mode = VALUES(reference_upload_mode),
  min_reference_images = VALUES(min_reference_images),
  required_reference = VALUES(required_reference),
  max_duration_seconds = VALUES(max_duration_seconds),
  updated_at = NOW(3);

INSERT INTO tier_model_bindings
  (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT t.id, m.id, 'primary', 0, 1, 1, 1
  FROM tmp_hongniao_video_models x
  JOIN model_tiers t ON t.tier_key = x.tier_key COLLATE utf8mb4_unicode_ci
  JOIN ai_models m ON m.provider_id = x.provider_id
                  AND m.api_model_name COLLATE utf8mb4_unicode_ci = x.api_model_name COLLATE utf8mb4_unicode_ci
                  AND m.deleted_at IS NULL
 WHERE x.provider_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  binding_type = VALUES(binding_type),
  fallback_order = VALUES(fallback_order),
  failover_on_error = VALUES(failover_on_error),
  failover_on_timeout = VALUES(failover_on_timeout),
  failover_on_rate_limit = VALUES(failover_on_rate_limit);

DROP TEMPORARY TABLE IF EXISTS tmp_hongniao_video_models;
