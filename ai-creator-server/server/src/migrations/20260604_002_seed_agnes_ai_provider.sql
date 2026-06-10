-- Agnes AI: 全模态免费 API（新加坡 Top 10 AI Lab）
-- 支持文生图/图生图/编辑 + 文生视频/图生视频/关键帧
-- API Key 通过 AGNES_API_KEY 环境变量同步
-- Base URL: https://apihub.agnes-ai.com/v1
-- Provider type: openai_compatible

SET @provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'agnes_ai' AND deleted_at IS NULL);

INSERT INTO ai_model_providers (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, remark, created_at)
SELECT 'Agnes AI', 'agnes_ai', 'openai_compatible', 'https://apihub.agnes-ai.com/v1', '', 120, 3, 'active', '全模态免费 API：图像+视频+文本。OpenAI 兼容格式。', NOW(3)
 WHERE @provider_exists = 0;

SET @pid := (SELECT id FROM ai_model_providers WHERE provider_key = 'agnes_ai' AND deleted_at IS NULL LIMIT 1);

-- 图像模型: agnes-image-2.1-flash（文生图/图生图/编辑，最多4张）
INSERT IGNORE INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, result_path, timeout_seconds, retry_times, retry_delay_ms, priority, points_cost, api_cost_cents, sort_order, remark, status, created_at, updated_at)
VALUES (@pid, 'agnes-image-2.1-flash', 'Agnes Image 2.1 Flash', 'image', 'text2img', 'agnes-image-2.1-flash', 'agnes-image-2.1-flash', 0, '', '{"extra_body":{"response_format":"url"}}', '', 120, 3, 1000, 0, 2, 0, 1, 'Agnes 图像生成。支持文生图/图生图/编辑，最多4张批量输出。', 'active', NOW(3), NOW(3));

UPDATE ai_models
   SET config = JSON_SET(
         COALESCE(config, JSON_OBJECT()),
         '$.capabilities', JSON_ARRAY('text_to_image','image_to_image','image_edit'),
         '$.supported_ratios', JSON_ARRAY('1:1','16:9','9:16','4:3','3:4'),
         '$.resolution_presets', JSON_ARRAY('1K','2K'),
         '$.default_size_key', '1:1_1K',
         '$.supports_image_count', TRUE,
         '$.max_images', 4
       ),
       updated_at = NOW(3)
 WHERE provider_id = @pid
   AND name = 'agnes-image-2.1-flash'
   AND deleted_at IS NULL;

-- 视频模型: agnes-video-v2.0（文生视频/图生视频/关键帧，720P/1080P）
INSERT IGNORE INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, result_path, timeout_seconds, retry_times, retry_delay_ms, priority, points_cost, api_cost_cents, sort_order, remark, status, created_at, updated_at)
VALUES (@pid, 'agnes-video-v2.0', 'Agnes Video V2.0', 'video', 'text2video', 'agnes-video-v2.0', 'agnes-video-v2.0', 1, '', '{}', '', 600, 2, 2000, 0, 5, 0, 1, 'Agnes 视频生成。文生视频/图生视频/关键帧，原生音频，2-10分钟。', 'active', NOW(3), NOW(3));

-- 绑定图像模型到 image_standard 档位作为后备
SET @img_model_id := (SELECT id FROM ai_models WHERE provider_id = @pid AND name = 'agnes-image-2.1-flash' AND deleted_at IS NULL LIMIT 1);
SET @img_tier_id := (SELECT id FROM model_tiers WHERE tier_key = 'image_standard' AND status = 'active' LIMIT 1);

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @img_tier_id, @img_model_id, 'fallback', 2, 1, 1, 1
 WHERE @img_tier_id IS NOT NULL AND @img_model_id IS NOT NULL;

-- 绑定视频模型到 video_standard 档位作为主模型
SET @vid_model_id := (SELECT id FROM ai_models WHERE provider_id = @pid AND name = 'agnes-video-v2.0' AND deleted_at IS NULL LIMIT 1);
SET @vid_tier_id := (SELECT id FROM model_tiers WHERE tier_key = 'video_standard' AND status = 'active' LIMIT 1);

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @vid_tier_id, @vid_model_id, 'primary', 0, 1, 1, 1
 WHERE @vid_tier_id IS NOT NULL AND @vid_model_id IS NOT NULL;
