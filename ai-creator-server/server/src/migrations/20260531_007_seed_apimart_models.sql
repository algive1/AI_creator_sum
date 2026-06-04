-- Seed APIMart provider, real media models and APIMart-only frontend tiers.
-- Source checked: https://docs.apimart.ai/llms.txt on 2026-05-31.
-- The API Key is intentionally not stored here. Admin must configure it in the backend UI.
-- Midjourney is intentionally excluded because APIMart public docs do not list MJ/Midjourney models.

INSERT INTO model_features (feature_key, feature_name, sort_order, status) VALUES
('image_create', 'AI 生图', 1, 'active'),
('image_to_image', '图生图', 2, 'active'),
('image_edit', '图片编辑', 3, 'active'),
('video_create', 'AI 生视频', 4, 'active'),
('image_to_video', '图生视频', 5, 'active'),
('first_last_frame_video', '首尾帧视频', 6, 'active'),
('video_edit', '视频编辑', 7, 'active')
ON DUPLICATE KEY UPDATE feature_name = VALUES(feature_name), sort_order = VALUES(sort_order), status = VALUES(status);

SET @apimart_provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'apimart' AND deleted_at IS NULL);

INSERT INTO ai_model_providers
  (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, remark, status, created_at)
SELECT 'APIMart', 'apimart', 'apimart', 'https://api.apimart.ai/v1', '', 600, 3,
       'APIMart async media API. Configure API Key in admin before using APIMart tiers.',
       'active', NOW(3)
WHERE @apimart_provider_exists = 0;

UPDATE ai_model_providers
   SET name = 'APIMart',
       provider_type = 'apimart',
       api_base_url = IF(api_base_url IS NULL OR api_base_url = '', 'https://api.apimart.ai/v1', api_base_url),
       default_timeout = GREATEST(COALESCE(default_timeout, 0), 600),
       default_retry = IF(default_retry IS NULL OR default_retry = 0, 3, default_retry),
       remark = 'APIMart async media API. Configure API Key in admin before using APIMart tiers.',
       updated_at = NOW(3)
 WHERE provider_key = 'apimart' AND deleted_at IS NULL;

SET @apimart_id := (SELECT id FROM ai_model_providers WHERE provider_key = 'apimart' AND deleted_at IS NULL LIMIT 1);

DROP TEMPORARY TABLE IF EXISTS tmp_apimart_models;
CREATE TEMPORARY TABLE tmp_apimart_models (
  provider_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  model_type VARCHAR(16) NOT NULL,
  sub_type VARCHAR(32) NOT NULL,
  api_model_name VARCHAR(64) NOT NULL,
  upstream_model_code VARCHAR(64) NOT NULL,
  query_task_url VARCHAR(255) NOT NULL,
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
  capabilities_json VARCHAR(255) NOT NULL,
  default_params_json VARCHAR(512) NOT NULL,
  source_url VARCHAR(255) NOT NULL,
  config_json LONGTEXT NULL,
  remark VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL,
  PRIMARY KEY (provider_id, api_model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_apimart_models
(provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, query_task_url, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, capabilities_json, default_params_json, source_url, remark, status)
VALUES
(@apimart_id, 'APMGptImage1Official', 'APIMart GPT Image 1 Official', 'image', 'text2img', 'gpt-image-1-official', 'gpt-image-1-official', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 12, 0, 9900, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gpt-image-1/generation.md', 'APIMart GPT Image 1 official channel.', 'active'),
(@apimart_id, 'APMGptImage15Official', 'APIMart GPT Image 1.5 Official', 'image', 'text2img', 'gpt-image-1.5-official', 'gpt-image-1.5-official', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 12, 0, 9899, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gpt-image-1/generation.md', 'APIMart GPT Image 1.5 official channel.', 'active'),
(@apimart_id, 'APMGptImage2', 'APIMart GPT Image 2', 'image', 'text2img', 'gpt-image-2', 'gpt-image-2', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 12, 0, 9898, '["text_to_image","image_to_image"]', '{"size":"1:1","resolution":"1k","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gpt-image-2/generation.md', 'APIMart GPT Image 2 image generation.', 'active'),
(@apimart_id, 'APMGptImage2Official', 'APIMart GPT Image 2 Official', 'image', 'text2img', 'gpt-image-2-official', 'gpt-image-2-official', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 15, 0, 9897, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1k","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gpt-image-2/official.md', 'APIMart GPT Image 2 official channel.', 'active'),
(@apimart_id, 'APMNano25', 'APIMart Nano Banana 2.5', 'image', 'text2img', 'gemini-2.5-flash-image-preview', 'gemini-2.5-flash-image-preview', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 6, 0, 9880, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gemini-2.5-flash/generation.md', 'APIMart Nano Banana standard channel.', 'active'),
(@apimart_id, 'APMNano25Official', 'APIMart Nano Banana 2.5 Official', 'image', 'text2img', 'gemini-2.5-flash-image-preview-official', 'gemini-2.5-flash-image-preview-official', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 8, 0, 9879, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gemini-2.5-flash/generation.md', 'APIMart Nano Banana official channel.', 'active'),
(@apimart_id, 'APMNano3Pro', 'APIMart Nano Banana Pro', 'image', 'text2img', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 12, 0, 9878, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md', 'APIMart Nano Banana Pro standard channel.', 'active'),
(@apimart_id, 'APMNano3ProOfficial', 'APIMart Nano Banana Pro Official', 'image', 'text2img', 'gemini-3-pro-image-preview-official', 'gemini-3-pro-image-preview-official', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 15, 0, 9877, '["text_to_image","image_to_image","image_edit"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md', 'APIMart Nano Banana Pro official channel.', 'active'),
(@apimart_id, 'APMNano31Flash', 'APIMart Nano Banana 3.1 Flash', 'image', 'text2img', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image-preview', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 8, 0, 9876, '["text_to_image","image_to_image"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md', 'APIMart Nano Banana 3.1 Flash standard channel.', 'active'),
(@apimart_id, 'APMNano31FlashOfficial', 'APIMart Nano Banana 3.1 Official', 'image', 'text2img', 'gemini-3.1-flash-image-preview-official', 'gemini-3.1-flash-image-preview-official', '/v1/tasks/{task_id}', 180, 3, 3000, 0, 0, 5, 0, 10, 0, 9875, '["text_to_image","image_to_image"]', '{"size":"1:1","resolution":"1K","n":1}', 'https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md', 'APIMart Nano Banana 3.1 Flash official channel.', 'active'),
(@apimart_id, 'APMSeedance15Text', 'APIMart Seedance 1.5 Text', 'video', 'text_to_video', 'doubao-seedance-1-5-pro:text', 'doubao-seedance-1-5-pro', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9799, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-1-5-pro/generation.md', 'APIMart Seedance 1.5 text-to-video.', 'active'),
(@apimart_id, 'APMSeedance15Image', 'APIMart Seedance 1.5 Image', 'video', 'image_to_video', 'doubao-seedance-1-5-pro:image', 'doubao-seedance-1-5-pro', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9798, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-1-5-pro/generation.md', 'APIMart Seedance 1.5 image-to-video.', 'active'),
(@apimart_id, 'APMSeedance15FL', 'APIMart Seedance 1.5 Frames', 'video', 'first_last_frame_video', 'doubao-seedance-1-5-pro:first_last', 'doubao-seedance-1-5-pro', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9797, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-1-5-pro/generation.md', 'APIMart Seedance 1.5 first-last-frame video.', 'active'),
(@apimart_id, 'APMSeedance20Text', 'APIMart Seedance 2.0 Text', 'video', 'text_to_video', 'doubao-seedance-2.0:text', 'doubao-seedance-2.0', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9796, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-2-0/generation.md', 'APIMart Seedance 2.0 text-to-video.', 'active'),
(@apimart_id, 'APMSeedance20Image', 'APIMart Seedance 2.0 Image', 'video', 'image_to_video', 'doubao-seedance-2.0:image', 'doubao-seedance-2.0', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9795, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-2-0/generation.md', 'APIMart Seedance 2.0 image-to-video.', 'active'),
(@apimart_id, 'APMSeedance20FL', 'APIMart Seedance 2.0 Frames', 'video', 'first_last_frame_video', 'doubao-seedance-2.0:first_last', 'doubao-seedance-2.0', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 65, 0, 9794, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-2-0/generation.md', 'APIMart Seedance 2.0 first-last-frame video.', 'active'),
(@apimart_id, 'APMSeedance20FastText', 'APIMart Seedance 2.0 Fast Text', 'video', 'text_to_video', 'doubao-seedance-2.0-fast:text', 'doubao-seedance-2.0-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9793, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-2-0/generation.md', 'APIMart Seedance 2.0 Fast text-to-video.', 'active'),
(@apimart_id, 'APMSeedance20FastImage', 'APIMart Seedance 2.0 Fast Image', 'video', 'image_to_video', 'doubao-seedance-2.0-fast:image', 'doubao-seedance-2.0-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9792, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-2-0/generation.md', 'APIMart Seedance 2.0 Fast image-to-video.', 'active'),
(@apimart_id, 'APMSeedance20FastFL', 'APIMart Seedance 2.0 Fast Frames', 'video', 'first_last_frame_video', 'doubao-seedance-2.0-fast:first_last', 'doubao-seedance-2.0-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 60, 0, 9791, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao-seedance-2-0/generation.md', 'APIMart Seedance 2.0 Fast first-last-frame video.', 'active'),
(@apimart_id, 'APMSeedance10FastText', 'APIMart Seedance 1.0 Fast Text', 'video', 'text_to_video', 'doubao-seedance-1-0-pro-fast:text', 'doubao-seedance-1-0-pro-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9790, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md', 'APIMart Seedance 1.0 Pro Fast text-to-video.', 'active'),
(@apimart_id, 'APMSeedance10FastImage', 'APIMart Seedance 1.0 Fast Image', 'video', 'image_to_video', 'doubao-seedance-1-0-pro-fast:image', 'doubao-seedance-1-0-pro-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9789, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md', 'APIMart Seedance 1.0 Pro Fast image-to-video.', 'active'),
(@apimart_id, 'APMSeedance10FastFL', 'APIMart Seedance 1.0 Fast Frames', 'video', 'first_last_frame_video', 'doubao-seedance-1-0-pro-fast:first_last', 'doubao-seedance-1-0-pro-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9788, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md', 'APIMart Seedance 1.0 Pro Fast first-last-frame video.', 'active'),
(@apimart_id, 'APMSeedance10QualityText', 'APIMart Seedance 1.0 Quality Text', 'video', 'text_to_video', 'doubao-seedance-1-0-pro-quality:text', 'doubao-seedance-1-0-pro-quality', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9787, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md', 'APIMart Seedance 1.0 Pro Quality text-to-video.', 'active'),
(@apimart_id, 'APMSeedance10QualityImage', 'APIMart Seedance 1.0 Quality Image', 'video', 'image_to_video', 'doubao-seedance-1-0-pro-quality:image', 'doubao-seedance-1-0-pro-quality', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9786, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md', 'APIMart Seedance 1.0 Pro Quality image-to-video.', 'active'),
(@apimart_id, 'APMSeedance10QualityFL', 'APIMart Seedance 1.0 Quality Frames', 'video', 'first_last_frame_video', 'doubao-seedance-1-0-pro-quality:first_last', 'doubao-seedance-1-0-pro-quality', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 60, 0, 9785, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/doubao/generation.md', 'APIMart Seedance 1.0 Pro Quality first-last-frame video.', 'active'),
(@apimart_id, 'APMGrokImagineVideoText', 'APIMart Grok Imagine Video Text', 'video', 'text_to_video', 'grok-imagine-1.0-video-apimart:text', 'grok-imagine-1.0-video-apimart', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9784, '["text_to_video"]', '{"size":"16:9","resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/grok-imagine/generation.md', 'APIMart Grok Imagine video text-to-video.', 'active'),
(@apimart_id, 'APMGrokImagineVideoImage', 'APIMart Grok Imagine Video Image', 'video', 'image_to_video', 'grok-imagine-1.0-video-apimart:image', 'grok-imagine-1.0-video-apimart', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9783, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/grok-imagine/generation.md', 'APIMart Grok Imagine video image-to-video.', 'active'),
(@apimart_id, 'APMHappyHorseText', 'APIMart HappyHorse Text', 'video', 'text_to_video', 'happyhorse-1.0:text', 'happyhorse-1.0', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9782, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.0/generation.md', 'APIMart HappyHorse text-to-video.', 'active'),
(@apimart_id, 'APMHappyHorseImage', 'APIMart HappyHorse Image', 'video', 'image_to_video', 'happyhorse-1.0:image', 'happyhorse-1.0', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9781, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.0/generation.md', 'APIMart HappyHorse image-to-video.', 'active'),
(@apimart_id, 'APMHappyHorseEdit', 'APIMart HappyHorse Video Edit', 'video', 'video_edit', 'happyhorse-1.0:video_edit', 'happyhorse-1.0', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9780, '["video_edit"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/happyhorse-1.0/generation.md', 'APIMart HappyHorse video edit.', 'active'),
(@apimart_id, 'APMMinimax02Text', 'APIMart MiniMax Hailuo 02 Text', 'video', 'text_to_video', 'MiniMax-Hailuo-02:text', 'MiniMax-Hailuo-02', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9779, '["text_to_video"]', '{"size":"16:9","resolution":"768p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo/generation.md', 'APIMart MiniMax Hailuo 02 text-to-video.', 'active'),
(@apimart_id, 'APMMinimax02Image', 'APIMart MiniMax Hailuo 02 Image', 'video', 'image_to_video', 'MiniMax-Hailuo-02:image', 'MiniMax-Hailuo-02', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9778, '["image_to_video"]', '{"resolution":"768p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo/generation.md', 'APIMart MiniMax Hailuo 02 image-to-video.', 'active'),
(@apimart_id, 'APMMinimax02FL', 'APIMart MiniMax Hailuo 02 Frames', 'video', 'first_last_frame_video', 'MiniMax-Hailuo-02:first_last', 'MiniMax-Hailuo-02', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9777, '["first_last_frame_video"]', '{"resolution":"768p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo/generation.md', 'APIMart MiniMax Hailuo 02 first-last-frame video.', 'active'),
(@apimart_id, 'APMMinimax23Text', 'APIMart MiniMax Hailuo 2.3 Text', 'video', 'text_to_video', 'MiniMax-Hailuo-2.3:text', 'MiniMax-Hailuo-2.3', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9776, '["text_to_video"]', '{"size":"16:9","resolution":"768p","duration":6}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo-2.3/generation.md', 'APIMart MiniMax Hailuo 2.3 text-to-video.', 'active'),
(@apimart_id, 'APMMinimax23Image', 'APIMart MiniMax Hailuo 2.3 Image', 'video', 'image_to_video', 'MiniMax-Hailuo-2.3:image', 'MiniMax-Hailuo-2.3', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9775, '["image_to_video"]', '{"resolution":"768p","duration":6}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo-2.3/generation.md', 'APIMart MiniMax Hailuo 2.3 image-to-video.', 'active'),
(@apimart_id, 'APMMinimax23FastText', 'APIMart MiniMax Hailuo 2.3 Fast Text', 'video', 'text_to_video', 'MiniMax-Hailuo-2.3-Fast:text', 'MiniMax-Hailuo-2.3-Fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9774, '["text_to_video"]', '{"size":"16:9","resolution":"768p","duration":6}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo-2.3/generation.md', 'APIMart MiniMax Hailuo 2.3 Fast text-to-video.', 'active'),
(@apimart_id, 'APMMinimax23FastImage', 'APIMart MiniMax Hailuo 2.3 Fast Image', 'video', 'image_to_video', 'MiniMax-Hailuo-2.3-Fast:image', 'MiniMax-Hailuo-2.3-Fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9773, '["image_to_video"]', '{"resolution":"768p","duration":6}', 'https://docs.apimart.ai/en/api-reference/videos/minimax-hailuo-2.3/generation.md', 'APIMart MiniMax Hailuo 2.3 Fast image-to-video.', 'active'),
(@apimart_id, 'APMPixverseV6Text', 'APIMart Pixverse V6 Text', 'video', 'text_to_video', 'pixverse-v6:text', 'pixverse-v6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 30, 0, 9772, '["text_to_video"]', '{"size":"16:9","resolution":"540p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/pixverse-v6/generation.md', 'APIMart Pixverse V6 text-to-video.', 'active'),
(@apimart_id, 'APMPixverseV6Image', 'APIMart Pixverse V6 Image', 'video', 'image_to_video', 'pixverse-v6:image', 'pixverse-v6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9771, '["image_to_video"]', '{"resolution":"540p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/pixverse-v6/generation.md', 'APIMart Pixverse V6 image-to-video.', 'active'),
(@apimart_id, 'APMPixverseV6FL', 'APIMart Pixverse V6 Frames', 'video', 'first_last_frame_video', 'pixverse-v6:first_last', 'pixverse-v6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9770, '["first_last_frame_video"]', '{"resolution":"540p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/pixverse-v6/generation.md', 'APIMart Pixverse V6 first-last-frame video.', 'active'),
(@apimart_id, 'APMSora2Text', 'APIMart Sora 2 Text', 'video', 'text_to_video', 'sora-2:text', 'sora-2', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 80, 0, 9769, '["text_to_video"]', '{"size":"16:9","resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/sora-2/generation.md', 'APIMart Sora 2 text-to-video.', 'active'),
(@apimart_id, 'APMSora2Image', 'APIMart Sora 2 Image', 'video', 'image_to_video', 'sora-2:image', 'sora-2', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 90, 0, 9768, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/sora-2/generation.md', 'APIMart Sora 2 image-to-video.', 'active'),
(@apimart_id, 'APMVeo31FastText', 'APIMart Veo 3.1 Fast Text', 'video', 'text_to_video', 'veo3.1-fast:text', 'veo3.1-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 60, 0, 9767, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation.md', 'APIMart Veo 3.1 Fast text-to-video.', 'active'),
(@apimart_id, 'APMVeo31FastImage', 'APIMart Veo 3.1 Fast Image', 'video', 'image_to_video', 'veo3.1-fast:image', 'veo3.1-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 65, 0, 9766, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation.md', 'APIMart Veo 3.1 Fast image-to-video.', 'active'),
(@apimart_id, 'APMVeo31FastOfficialText', 'APIMart Veo 3.1 Fast Official Text', 'video', 'text_to_video', 'veo3.1-fast-official:text', 'veo3.1-fast-official', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 70, 0, 9765, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md', 'APIMart Veo 3.1 Fast official text-to-video.', 'active'),
(@apimart_id, 'APMVeo31FastOfficialImage', 'APIMart Veo 3.1 Fast Official Image', 'video', 'image_to_video', 'veo3.1-fast-official:image', 'veo3.1-fast-official', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 75, 0, 9764, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md', 'APIMart Veo 3.1 Fast official image-to-video.', 'active'),
(@apimart_id, 'APMVeo31FastOfficialFL', 'APIMart Veo 3.1 Fast Official Frames', 'video', 'first_last_frame_video', 'veo3.1-fast-official:first_last', 'veo3.1-fast-official', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 85, 0, 9763, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md', 'APIMart Veo 3.1 Fast official first-last-frame video.', 'active'),
(@apimart_id, 'APMVeo31QualityOfficialText', 'APIMart Veo 3.1 Quality Official Text', 'video', 'text_to_video', 'veo3.1-quality-official:text', 'veo3.1-quality-official', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 90, 0, 9762, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md', 'APIMart Veo 3.1 Quality official text-to-video.', 'active'),
(@apimart_id, 'APMVeo31QualityOfficialImage', 'APIMart Veo 3.1 Quality Official Image', 'video', 'image_to_video', 'veo3.1-quality-official:image', 'veo3.1-quality-official', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 95, 0, 9761, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md', 'APIMart Veo 3.1 Quality official image-to-video.', 'active'),
(@apimart_id, 'APMVeo31QualityOfficialFL', 'APIMart Veo 3.1 Quality Official Frames', 'video', 'first_last_frame_video', 'veo3.1-quality-official:first_last', 'veo3.1-quality-official', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 105, 0, 9760, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/veo3/generation-official.md', 'APIMart Veo 3.1 Quality official first-last-frame video.', 'active'),
(@apimart_id, 'APMWan25Text', 'APIMart Wan 2.5 Text', 'video', 'text_to_video', 'wan2.5-preview:text', 'wan2.5-preview', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 30, 0, 9759, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.5/generation.md', 'APIMart Wan 2.5 text-to-video.', 'active'),
(@apimart_id, 'APMWan25Image', 'APIMart Wan 2.5 Image', 'video', 'image_to_video', 'wan2.5-preview:image', 'wan2.5-preview', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9758, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.5/generation.md', 'APIMart Wan 2.5 image-to-video.', 'active'),
(@apimart_id, 'APMWan26Text', 'APIMart Wan 2.6 Text', 'video', 'text_to_video', 'wan2.6:text', 'wan2.6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9757, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.6/generation.md', 'APIMart Wan 2.6 text-to-video.', 'active'),
(@apimart_id, 'APMWan26Image', 'APIMart Wan 2.6 Image', 'video', 'image_to_video', 'wan2.6:image', 'wan2.6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9756, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.6/generation.md', 'APIMart Wan 2.6 image-to-video.', 'active'),
(@apimart_id, 'APMWan26FlashImage', 'APIMart Wan 2.6 I2V Flash', 'video', 'image_to_video', 'wan2.6-i2v-flash:image', 'wan2.6-i2v-flash', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9755, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.6/i2v-flash-generation.md', 'APIMart Wan 2.6 I2V Flash image-to-video.', 'active'),
(@apimart_id, 'APMWan27Text', 'APIMart Wan 2.7 Text', 'video', 'text_to_video', 'wan2.7:text', 'wan2.7', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9754, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.7/generation.md', 'APIMart Wan 2.7 text-to-video.', 'active'),
(@apimart_id, 'APMWan27Image', 'APIMart Wan 2.7 Image', 'video', 'image_to_video', 'wan2.7:image', 'wan2.7', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9753, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.7/generation.md', 'APIMart Wan 2.7 image-to-video.', 'active'),
(@apimart_id, 'APMWan27FL', 'APIMart Wan 2.7 Frames', 'video', 'first_last_frame_video', 'wan2.7:first_last', 'wan2.7', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9752, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.7/generation.md', 'APIMart Wan 2.7 first-last-frame video.', 'active'),
(@apimart_id, 'APMWan27R2VImage', 'APIMart Wan 2.7 R2V', 'video', 'image_to_video', 'wan2.7-r2v:image', 'wan2.7-r2v', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9751, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.7-r2v/generation.md', 'APIMart Wan 2.7 reference-to-video.', 'active'),
(@apimart_id, 'APMWan27Edit', 'APIMart Wan 2.7 Video Edit', 'video', 'video_edit', 'wan2.7-videoedit:video_edit', 'wan2.7-videoedit', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 60, 0, 9750, '["video_edit"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/wan2.7-videoedit/generation.md', 'APIMart Wan 2.7 video edit.', 'active'),
(@apimart_id, 'APMKling26Text', 'APIMart Kling 2.6 Text', 'video', 'text_to_video', 'kling-v2-6:text', 'kling-v2-6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9749, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/generation.md', 'APIMart Kling 2.6 text-to-video.', 'active'),
(@apimart_id, 'APMKling26Image', 'APIMart Kling 2.6 Image', 'video', 'image_to_video', 'kling-v2-6:image', 'kling-v2-6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9748, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/generation.md', 'APIMart Kling 2.6 image-to-video.', 'active'),
(@apimart_id, 'APMKling26FL', 'APIMart Kling 2.6 Frames', 'video', 'first_last_frame_video', 'kling-v2-6:first_last', 'kling-v2-6', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 60, 0, 9747, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/generation.md', 'APIMart Kling 2.6 first-last-frame video.', 'active'),
(@apimart_id, 'APMKling26MotionEdit', 'APIMart Kling 2.6 Motion Control', 'video', 'video_edit', 'kling-v2-6-motion-control:video_edit', 'kling-v2-6-motion-control', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 70, 0, 9746, '["video_edit"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/kling-v2-6-motion-control-generation.md', 'APIMart Kling 2.6 motion control. Not bound by default.', 'active'),
(@apimart_id, 'APMKling3Text', 'APIMart Kling 3 Text', 'video', 'text_to_video', 'kling-v3:text', 'kling-v3', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9745, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v3/generation.md', 'APIMart Kling 3 text-to-video.', 'active'),
(@apimart_id, 'APMKling3Image', 'APIMart Kling 3 Image', 'video', 'image_to_video', 'kling-v3:image', 'kling-v3', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 60, 0, 9744, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v3/generation.md', 'APIMart Kling 3 image-to-video.', 'active'),
(@apimart_id, 'APMKling3FL', 'APIMart Kling 3 Frames', 'video', 'first_last_frame_video', 'kling-v3:first_last', 'kling-v3', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 70, 0, 9743, '["first_last_frame_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v3/generation.md', 'APIMart Kling 3 first-last-frame video.', 'active'),
(@apimart_id, 'APMKling3OmniText', 'APIMart Kling 3 Omni Text', 'video', 'text_to_video', 'kling-v3-omni:text', 'kling-v3-omni', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 60, 0, 9742, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v3-omni/generation.md', 'APIMart Kling 3 Omni text-to-video.', 'active'),
(@apimart_id, 'APMKling3OmniImage', 'APIMart Kling 3 Omni Image', 'video', 'image_to_video', 'kling-v3-omni:image', 'kling-v3-omni', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 65, 0, 9741, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-v3-omni/generation.md', 'APIMart Kling 3 Omni image-to-video.', 'active'),
(@apimart_id, 'APMKlingO1Text', 'APIMart Kling O1 Text', 'video', 'text_to_video', 'kling-video-o1:text', 'kling-video-o1', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 80, 0, 9740, '["text_to_video"]', '{"size":"16:9","resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-video-o1/generation.md', 'APIMart Kling Video O1 text-to-video.', 'active'),
(@apimart_id, 'APMKlingO1Image', 'APIMart Kling O1 Image', 'video', 'image_to_video', 'kling-video-o1:image', 'kling-video-o1', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 2, 0, 85, 0, 9739, '["image_to_video"]', '{"resolution":"720P","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/kling-video-o1/generation.md', 'APIMart Kling Video O1 image-to-video.', 'active'),
(@apimart_id, 'APMOmniFlashText', 'APIMart Omni Flash Text', 'video', 'text_to_video', 'Omni-Flash-Ext:text', 'Omni-Flash-Ext', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9738, '["text_to_video"]', '{"size":"16:9","resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/omni-flash-ext/generation.md', 'APIMart Omni Flash Ext text-to-video.', 'active'),
(@apimart_id, 'APMOmniFlashImage', 'APIMart Omni Flash Image', 'video', 'image_to_video', 'Omni-Flash-Ext:image', 'Omni-Flash-Ext', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9737, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/omni-flash-ext/generation.md', 'APIMart Omni Flash Ext image-to-video.', 'active'),
(@apimart_id, 'APMOmniFlashEdit', 'APIMart Omni Flash Video Edit', 'video', 'video_edit', 'Omni-Flash-Ext:video_edit', 'Omni-Flash-Ext', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 65, 0, 9736, '["video_edit"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/omni-flash-ext/generation.md', 'APIMart Omni Flash Ext video reference mode. Not bound by default.', 'active'),
(@apimart_id, 'APMSkyreelsV4FastText', 'APIMart SkyReels V4 Fast Text', 'video', 'text_to_video', 'skyreels-v4-fast:text', 'skyreels-v4-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9735, '["text_to_video"]', '{"size":"16:9","resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md', 'APIMart SkyReels V4 Fast text-to-video.', 'active'),
(@apimart_id, 'APMSkyreelsV4FastImage', 'APIMart SkyReels V4 Fast Image', 'video', 'image_to_video', 'skyreels-v4-fast:image', 'skyreels-v4-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9734, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md', 'APIMart SkyReels V4 Fast image-to-video.', 'active'),
(@apimart_id, 'APMSkyreelsV4FastFL', 'APIMart SkyReels V4 Fast Frames', 'video', 'first_last_frame_video', 'skyreels-v4-fast:first_last', 'skyreels-v4-fast', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9733, '["first_last_frame_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md', 'APIMart SkyReels V4 Fast first-last-frame video.', 'active'),
(@apimart_id, 'APMSkyreelsV4StdText', 'APIMart SkyReels V4 Std Text', 'video', 'text_to_video', 'skyreels-v4-std:text', 'skyreels-v4-std', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 45, 0, 9732, '["text_to_video"]', '{"size":"16:9","resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md', 'APIMart SkyReels V4 Std text-to-video.', 'active'),
(@apimart_id, 'APMSkyreelsV4StdImage', 'APIMart SkyReels V4 Std Image', 'video', 'image_to_video', 'skyreels-v4-std:image', 'skyreels-v4-std', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9731, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md', 'APIMart SkyReels V4 Std image-to-video.', 'active'),
(@apimart_id, 'APMSkyreelsV4StdFL', 'APIMart SkyReels V4 Std Frames', 'video', 'first_last_frame_video', 'skyreels-v4-std:first_last', 'skyreels-v4-std', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9730, '["first_last_frame_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/skyreels-v4/generation.md', 'APIMart SkyReels V4 Std first-last-frame video.', 'active'),
(@apimart_id, 'APMViduQ3Image', 'APIMart Vidu Q3 Image', 'video', 'image_to_video', 'viduq3:image', 'viduq3', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 35, 0, 9729, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/vidu-q3/generation.md', 'APIMart Vidu Q3 reference-to-video.', 'active'),
(@apimart_id, 'APMViduQ3MixImage', 'APIMart Vidu Q3 Mix Image', 'video', 'image_to_video', 'viduq3-mix:image', 'viduq3-mix', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 40, 0, 9728, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/vidu-q3/generation.md', 'APIMart Vidu Q3 Mix reference-to-video.', 'active'),
(@apimart_id, 'APMViduQ3ProText', 'APIMart Vidu Q3 Pro Text', 'video', 'text_to_video', 'viduq3-pro:text', 'viduq3-pro', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 50, 0, 9727, '["text_to_video"]', '{"size":"16:9","resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/vidu-q3-pro/generation.md', 'APIMart Vidu Q3 Pro text-to-video.', 'active'),
(@apimart_id, 'APMViduQ3ProImage', 'APIMart Vidu Q3 Pro Image', 'video', 'image_to_video', 'viduq3-pro:image', 'viduq3-pro', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 55, 0, 9726, '["image_to_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/vidu-q3-pro/generation.md', 'APIMart Vidu Q3 Pro image-to-video.', 'active'),
(@apimart_id, 'APMViduQ3ProFL', 'APIMart Vidu Q3 Pro Frames', 'video', 'first_last_frame_video', 'viduq3-pro:first_last', 'viduq3-pro', '/v1/tasks/{task_id}', 600, 3, 5000, 0, 0, 3, 0, 65, 0, 9725, '["first_last_frame_video"]', '{"resolution":"720p","duration":5}', 'https://docs.apimart.ai/en/api-reference/videos/vidu-q3-pro/generation.md', 'APIMart Vidu Q3 Pro first-last-frame video.', 'active');

UPDATE tmp_apimart_models
   SET config_json = CONCAT(
     '{"source":"apimart_docs","source_checked_at":"2026-05-31","source_url":"', source_url,
     '","api_format":"apimart_async","capabilities":', capabilities_json,
     ',"default_params":', default_params_json,
     ',"endpoints":{"create":"', CASE WHEN model_type = 'image' THEN '/v1/images/generations' ELSE '/v1/videos/generations' END,
     '","query":"/v1/tasks/{task_id}"}}'
   );

UPDATE ai_models m
JOIN tmp_apimart_models s
  ON s.provider_id = m.provider_id
 AND s.api_model_name COLLATE utf8mb4_unicode_ci = m.api_model_name COLLATE utf8mb4_unicode_ci
 AND m.deleted_at IS NULL
   SET m.name = s.name,
       m.display_name = s.display_name,
       m.model_type = s.model_type,
       m.sub_type = s.sub_type,
       m.upstream_model_code = s.upstream_model_code,
       m.is_async = 1,
       m.query_task_url = s.query_task_url,
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
SELECT s.provider_id, s.name, s.display_name, s.model_type, s.sub_type, s.api_model_name, s.upstream_model_code, 1,
       s.query_task_url, '{}', '', '{}', '{}', s.timeout_seconds, s.retry_times, s.retry_delay_ms,
       s.daily_limit, s.daily_limit_per_user, s.max_concurrency, s.priority, s.points_cost, s.api_cost_cents,
       s.sort_order, s.config_json, s.remark, s.status, NOW(3), NOW(3)
  FROM tmp_apimart_models s
 WHERE NOT EXISTS (
   SELECT 1 FROM ai_models m
    WHERE m.provider_id = s.provider_id
      AND m.api_model_name COLLATE utf8mb4_unicode_ci = s.api_model_name COLLATE utf8mb4_unicode_ci
      AND m.deleted_at IS NULL
 );

SET @fi_img := (SELECT id FROM model_features WHERE feature_key='image_create' LIMIT 1);
SET @fi_i2i := (SELECT id FROM model_features WHERE feature_key='image_to_image' LIMIT 1);
SET @fi_edit := (SELECT id FROM model_features WHERE feature_key='image_edit' LIMIT 1);
SET @fi_vid := (SELECT id FROM model_features WHERE feature_key='video_create' LIMIT 1);
SET @fi_i2v := (SELECT id FROM model_features WHERE feature_key='image_to_video' LIMIT 1);
SET @fi_flf := (SELECT id FROM model_features WHERE feature_key='first_last_frame_video' LIMIT 1);
SET @fi_v_edit := (SELECT id FROM model_features WHERE feature_key='video_edit' LIMIT 1);

INSERT INTO model_tiers (feature_id, tier_name, tier_key, description, tag, points_cost, is_default, is_recommended, sort_order, status) VALUES
(@fi_img, 'APIMart GPT Image', 'apimart_image_gpt', 'APIMart GPT image models. Configure APIMart key before use.', 'APIMart', 12, 0, 0, 90, 'active'),
(@fi_img, 'APIMart Nano Banana', 'apimart_image_nano', 'APIMart Nano Banana image models. Configure APIMart key before use.', 'APIMart', 6, 0, 0, 89, 'active'),
(@fi_i2i, 'APIMart GPT Image Reference', 'apimart_i2i_gpt', 'APIMart image-to-image models. Configure APIMart key before use.', 'APIMart', 12, 0, 0, 90, 'active'),
(@fi_edit, 'APIMart Image Edit', 'apimart_image_edit', 'APIMart image edit and mask-capable models. Configure APIMart key before use.', 'APIMart', 12, 0, 0, 90, 'active'),
(@fi_vid, 'APIMart Sora Video', 'apimart_video_sora', 'APIMart Sora/Veo/Wan text-to-video. Configure APIMart key before use.', 'APIMart', 80, 0, 0, 90, 'active'),
(@fi_vid, 'APIMart Wan Video', 'apimart_video_wan', 'APIMart Wan text-to-video. Configure APIMart key before use.', 'APIMart', 40, 0, 0, 89, 'active'),
(@fi_vid, 'APIMart Veo Video', 'apimart_video_veo', 'APIMart Veo text-to-video. Configure APIMart key before use.', 'APIMart', 60, 0, 0, 88, 'active'),
(@fi_vid, 'APIMart Pixverse Video', 'apimart_video_pixverse', 'APIMart Pixverse/SkyReels text-to-video. Configure APIMart key before use.', 'APIMart', 30, 0, 0, 87, 'active'),
(@fi_i2v, 'APIMart Image To Video', 'apimart_i2v_wan', 'APIMart image-to-video models. Configure APIMart key before use.', 'APIMart', 45, 0, 0, 90, 'active'),
(@fi_flf, 'APIMart First Last Video', 'apimart_first_last', 'APIMart first-last-frame video models. Configure APIMart key before use.', 'APIMart', 55, 0, 0, 90, 'active'),
(@fi_v_edit, 'APIMart Video Edit', 'apimart_video_edit', 'APIMart video edit models. Configure APIMart key before use.', 'APIMart', 60, 0, 0, 90, 'active')
ON DUPLICATE KEY UPDATE
  tier_name = VALUES(tier_name),
  description = VALUES(description),
  tag = VALUES(tag),
  points_cost = VALUES(points_cost),
  is_default = VALUES(is_default),
  is_recommended = VALUES(is_recommended),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  updated_at = NOW(3);

INSERT INTO tier_capabilities (
  tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves,
  supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
  max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_duration_seconds
)
SELECT t.id,
  '["auto","1:1","3:2","2:3","4:3","3:4","5:4","4:5","16:9","9:16","2:1","1:2","3:1","1:3","21:9","9:21","1:4","4:1","1:8","8:1"]',
  '["1K","2K","4K"]', '[]', NULL, NULL,
  '["auto","ratio","custom_pixels"]', 1, '["1024x1024","2048x2048","2880x2880","auto"]', '1:1',
  4096, 4096, 64, 64, 16777216, 8.0000, 1, '["cover","contain","resize"]', 0,
  CASE WHEN t.tier_key = 'apimart_image_edit' THEN 1 ELSE 16 END, 0
FROM model_tiers t
WHERE t.tier_key IN ('apimart_image_gpt','apimart_image_nano','apimart_i2i_gpt','apimart_image_edit')
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_styles = VALUES(supported_styles),
  supported_durations = VALUES(supported_durations),
  supported_camera_moves = VALUES(supported_camera_moves),
  supported_size_modes = VALUES(supported_size_modes),
  allow_custom_pixels = VALUES(allow_custom_pixels),
  native_sizes = VALUES(native_sizes),
  default_ratio = VALUES(default_ratio),
  max_width = VALUES(max_width),
  max_height = VALUES(max_height),
  min_width = VALUES(min_width),
  min_height = VALUES(min_height),
  max_total_pixels = VALUES(max_total_pixels),
  max_aspect_ratio = VALUES(max_aspect_ratio),
  allow_postprocess = VALUES(allow_postprocess),
  postprocess_modes = VALUES(postprocess_modes),
  allow_upscale = VALUES(allow_upscale),
  max_images = VALUES(max_images),
  max_duration_seconds = VALUES(max_duration_seconds);

INSERT INTO tier_capabilities (
  tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves,
  supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
  max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_duration_seconds
)
SELECT t.id,
  '["16:9","9:16","1:1","4:3","3:4","3:2","2:3","21:9"]',
  '["360p","540p","720p","768p","1080p","720P","1080P","4K"]', '[]', '["5s","6s","8s","10s","15s"]',
  '["static","push_in","pull_out","pan_left","pan_right","tilt_up","tilt_down"]',
  '["auto","ratio"]', 0, '[]', '16:9',
  4096, 4096, 240, 240, 16777216, 8.0000, 0, '[]', 0, 7, 15
FROM model_tiers t
WHERE t.tier_key IN ('apimart_video_sora','apimart_video_wan','apimart_video_veo','apimart_video_pixverse','apimart_i2v_wan','apimart_first_last','apimart_video_edit')
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_styles = VALUES(supported_styles),
  supported_durations = VALUES(supported_durations),
  supported_camera_moves = VALUES(supported_camera_moves),
  supported_size_modes = VALUES(supported_size_modes),
  allow_custom_pixels = VALUES(allow_custom_pixels),
  native_sizes = VALUES(native_sizes),
  default_ratio = VALUES(default_ratio),
  max_width = VALUES(max_width),
  max_height = VALUES(max_height),
  min_width = VALUES(min_width),
  min_height = VALUES(min_height),
  max_total_pixels = VALUES(max_total_pixels),
  max_aspect_ratio = VALUES(max_aspect_ratio),
  allow_postprocess = VALUES(allow_postprocess),
  postprocess_modes = VALUES(postprocess_modes),
  allow_upscale = VALUES(allow_upscale),
  max_images = VALUES(max_images),
  max_duration_seconds = VALUES(max_duration_seconds);

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order)
SELECT t.id, m.id, x.binding_type, x.fallback_order
FROM (
  SELECT 'apimart_image_gpt' AS tier_key, 'APMGptImage2' AS model_name, 'primary' AS binding_type, 0 AS fallback_order
  UNION ALL SELECT 'apimart_image_gpt', 'APMGptImage2Official', 'fallback', 1
  UNION ALL SELECT 'apimart_image_gpt', 'APMGptImage15Official', 'fallback', 2
  UNION ALL SELECT 'apimart_image_nano', 'APMNano25', 'primary', 0
  UNION ALL SELECT 'apimart_image_nano', 'APMNano31Flash', 'fallback', 1
  UNION ALL SELECT 'apimart_image_nano', 'APMNano3Pro', 'fallback', 2
  UNION ALL SELECT 'apimart_i2i_gpt', 'APMGptImage2', 'primary', 0
  UNION ALL SELECT 'apimart_i2i_gpt', 'APMNano31Flash', 'fallback', 1
  UNION ALL SELECT 'apimart_image_edit', 'APMGptImage2Official', 'primary', 0
  UNION ALL SELECT 'apimart_image_edit', 'APMGptImage15Official', 'fallback', 1
  UNION ALL SELECT 'apimart_image_edit', 'APMNano3Pro', 'fallback', 2
  UNION ALL SELECT 'apimart_video_sora', 'APMSora2Text', 'primary', 0
  UNION ALL SELECT 'apimart_video_sora', 'APMVeo31FastText', 'fallback', 1
  UNION ALL SELECT 'apimart_video_sora', 'APMWan27Text', 'fallback', 2
  UNION ALL SELECT 'apimart_video_wan', 'APMWan27Text', 'primary', 0
  UNION ALL SELECT 'apimart_video_wan', 'APMWan26Text', 'fallback', 1
  UNION ALL SELECT 'apimart_video_wan', 'APMPixverseV6Text', 'fallback', 2
  UNION ALL SELECT 'apimart_video_veo', 'APMVeo31FastText', 'primary', 0
  UNION ALL SELECT 'apimart_video_veo', 'APMVeo31FastOfficialText', 'fallback', 1
  UNION ALL SELECT 'apimart_video_pixverse', 'APMPixverseV6Text', 'primary', 0
  UNION ALL SELECT 'apimart_video_pixverse', 'APMSkyreelsV4FastText', 'fallback', 1
  UNION ALL SELECT 'apimart_i2v_wan', 'APMWan27Image', 'primary', 0
  UNION ALL SELECT 'apimart_i2v_wan', 'APMPixverseV6Image', 'fallback', 1
  UNION ALL SELECT 'apimart_i2v_wan', 'APMVeo31FastImage', 'fallback', 2
  UNION ALL SELECT 'apimart_first_last', 'APMWan27FL', 'primary', 0
  UNION ALL SELECT 'apimart_first_last', 'APMPixverseV6FL', 'fallback', 1
  UNION ALL SELECT 'apimart_first_last', 'APMVeo31FastOfficialFL', 'fallback', 2
  UNION ALL SELECT 'apimart_video_edit', 'APMWan27Edit', 'primary', 0
  UNION ALL SELECT 'apimart_video_edit', 'APMHappyHorseEdit', 'fallback', 1
) x
JOIN model_tiers t ON t.tier_key = x.tier_key
JOIN ai_model_providers p ON p.provider_key = 'apimart' AND p.deleted_at IS NULL
JOIN ai_models m ON m.provider_id = p.id AND m.name = x.model_name AND m.deleted_at IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_apimart_models;
