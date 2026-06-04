-- seed_phase12.sql
-- WARNING: FOR NEW INSTALLATIONS ONLY. DO NOT EXECUTE ON AN EXISTING PRODUCTION DATABASE.
-- 默认前台模型功能、档位与能力；真实 API Key 仍需后台配置。

INSERT INTO model_features (feature_key, feature_name, sort_order, status) VALUES
('image_create', 'AI 生图', 1, 'active'),
('image_to_image', '图生图', 2, 'active'),
('image_edit', '图片编辑', 3, 'active'),
('video_create', 'AI 生视频', 4, 'active'),
('image_to_video', '图生视频', 5, 'active'),
('first_last_frame_video', '首尾帧视频', 6, 'active'),
('video_edit', '视频编辑', 7, 'active'),
('prompt_optimize', '提示词优化', 8, 'active'),
('comic_create', 'AI 漫剧', 9, 'inactive')
ON DUPLICATE KEY UPDATE
  feature_name = VALUES(feature_name),
  sort_order = VALUES(sort_order),
  status = VALUES(status);

INSERT INTO model_tiers (feature_id, tier_name, tier_key, description, tag, points_cost, is_default, is_recommended, sort_order, status) VALUES
((SELECT id FROM model_features WHERE feature_key='image_create'), '标准生图', 'image_standard', '适合日常生图和电商素材', '', 2, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='image_create'), '专业生图', 'image_pro', '更高质量的商业图片生成', '推荐', 5, 0, 1, 2, 'active'),
((SELECT id FROM model_features WHERE feature_key='image_create'), '顶级生图', 'image_top', '高质量创意与复杂画面生成', '高清', 10, 0, 0, 3, 'active'),
((SELECT id FROM model_features WHERE feature_key='image_to_image'), '标准图生图', 'image_to_image_standard', '上传参考图生成新图', '', 3, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='image_edit'), '标准图片编辑', 'image_edit_standard', '上传图片进行局部修改', '', 3, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='video_create'), '标准生视频', 'video_standard', '适合短视频和产品展示', '', 5, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='video_create'), '专业生视频', 'video_pro', '更稳定的视频生成质量', '推荐', 15, 0, 1, 2, 'active'),
((SELECT id FROM model_features WHERE feature_key='video_create'), '顶级生视频', 'video_top', '高质量长视频或复杂运镜', '高清', 25, 0, 0, 3, 'active'),
((SELECT id FROM model_features WHERE feature_key='image_to_video'), '标准图生视频', 'image_to_video_standard', '上传首帧图生成视频', '', 5, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='first_last_frame_video'), '标准首尾帧视频', 'first_last_frame_standard', '上传首帧和尾帧生成过渡视频', '', 8, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='video_edit'), '标准视频编辑', 'video_edit_standard', '上传视频进行编辑修改', '', 10, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='prompt_optimize'), '标准提示词优化', 'prompt_optimize_standard', 'AI 智能优化提示词', '', 1, 1, 0, 1, 'active')
ON DUPLICATE KEY UPDATE
  tier_name = VALUES(tier_name),
  description = VALUES(description),
  tag = VALUES(tag),
  points_cost = VALUES(points_cost),
  is_default = VALUES(is_default),
  is_recommended = VALUES(is_recommended),
  sort_order = VALUES(sort_order),
  status = VALUES(status);

INSERT INTO tier_capabilities (
  tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves,
  supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
  max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_duration_seconds
)
SELECT t.id, '["1:1","16:9","9:16","4:5","4:3","3:4"]', '["standard","hd"]', '[]', NULL, NULL,
  '["auto","ratio","custom_pixels"]', 1, '["1024x1024","1536x1024","1024x1536","auto"]', '1:1', 2048, 2048, 64, 64,
  4194304, 4.0000, 1, '["cover","contain","resize"]', 0, 3, 30
FROM model_tiers t
JOIN model_features f ON f.id = t.feature_id
WHERE f.feature_key IN ('image_create', 'image_to_image', 'image_edit')
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_styles = VALUES(supported_styles),
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
  max_images = VALUES(max_images);

INSERT INTO tier_capabilities (
  tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves,
  supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
  max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_duration_seconds
)
SELECT t.id, '["16:9","9:16","1:1"]', '["720p","1080p"]', '[]', '["5s","10s","15s","30s"]', '["static","push_in","pull_out","pan_left","pan_right","tilt_up","tilt_down"]',
  '["auto","ratio"]', 0, '[]', '9:16', 1920, 1920, 256, 256,
  3686400, 4.0000, 0, '[]', 0, 1, 30
FROM model_tiers t
JOIN model_features f ON f.id = t.feature_id
WHERE f.feature_key IN ('video_create', 'image_to_video', 'first_last_frame_video', 'video_edit')
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_durations = VALUES(supported_durations),
  supported_camera_moves = VALUES(supported_camera_moves),
  supported_size_modes = VALUES(supported_size_modes),
  default_ratio = VALUES(default_ratio),
  max_duration_seconds = VALUES(max_duration_seconds);

INSERT INTO tier_capabilities (
  tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves,
  supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
  max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_duration_seconds
)
SELECT t.id, '[]', '[]', '[]', NULL, NULL, '[]', 0, '[]', '', 0, 0, 0, 0, 0, 4.0000, 0, '[]', 0, 1, 0
FROM model_tiers t
JOIN model_features f ON f.id = t.feature_id
WHERE f.feature_key = 'prompt_optimize'
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_styles = VALUES(supported_styles),
  supported_size_modes = VALUES(supported_size_modes);

-- Avoid treating a placeholder as a configured production API key.
UPDATE ai_model_providers
SET api_key = ''
WHERE api_key LIKE 'sk-your-%' OR api_key LIKE 'your-%' OR api_key LIKE 'please_change%';

-- Remove orphaned rows that can be produced when seed migrations run before seed data.
DELETE c FROM tier_capabilities c
LEFT JOIN model_tiers t ON t.id = c.tier_id
LEFT JOIN model_features f ON f.id = t.feature_id
WHERE t.id IS NULL OR f.id IS NULL OR c.tier_id = 0;

DELETE t FROM model_tiers t
LEFT JOIN model_features f ON f.id = t.feature_id
WHERE f.id IS NULL OR t.feature_id = 0;

DELETE b FROM tier_model_bindings b
LEFT JOIN model_tiers t ON t.id = b.tier_id
LEFT JOIN ai_models m ON m.id = b.model_id
WHERE t.id IS NULL OR m.id IS NULL OR b.tier_id = 0 OR b.model_id = 0;

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order)
SELECT t.id, m.id, x.binding_type, x.fallback_order
FROM (
  SELECT 'image_standard' AS tier_key, 'wellapi' AS provider_key, 'WQwenImage20' AS model_name, 'primary' AS binding_type, 0 AS fallback_order
  UNION ALL SELECT 'image_standard', 'bagege', 'GPTImage2', 'fallback', 1
  UNION ALL SELECT 'image_pro', 'bagege', 'GPTImage2', 'primary', 0
  UNION ALL SELECT 'image_pro', 'wellapi', 'WQwenImage20', 'fallback', 1
  UNION ALL SELECT 'image_top', 'bagege', 'GPTImage2', 'primary', 0
  UNION ALL SELECT 'image_top', 'codesonline_image', 'gpt-image-2-codex', 'fallback', 1
  UNION ALL SELECT 'image_to_image_standard', 'bagege', 'GPTImage2', 'primary', 0
  UNION ALL SELECT 'image_edit_standard', 'xiaoma', 'qwen-image', 'primary', 0
  UNION ALL SELECT 'video_standard', 'wellapi', 'WHailuo02Text', 'primary', 0
  UNION ALL SELECT 'video_standard', 'wellapi', 'WPixverseV6Text', 'fallback', 1
  UNION ALL SELECT 'video_pro', 'wellapi', 'WPixverseV6Text', 'primary', 0
  UNION ALL SELECT 'video_pro', 'bagege', 'Veo31Fast', 'fallback', 1
  UNION ALL SELECT 'video_top', 'bagege', 'Veo31Fast', 'primary', 0
  UNION ALL SELECT 'video_top', 'wellapi', 'WGrokVideo310sText', 'fallback', 1
  UNION ALL SELECT 'image_to_video_standard', 'wellapi', 'WHailuo02Image', 'primary', 0
  UNION ALL SELECT 'first_last_frame_standard', 'wellapi', 'WHailuo02FL', 'primary', 0
  UNION ALL SELECT 'video_edit_standard', 'xiaoma', 'happyhorse-video-edit', 'primary', 0
  UNION ALL SELECT 'prompt_optimize_standard', 'xiaoma', 'gpt-5.2-chat-latest', 'primary', 0
) x
JOIN model_tiers t ON t.tier_key = x.tier_key
JOIN ai_model_providers p ON p.provider_key = x.provider_key AND p.deleted_at IS NULL
JOIN ai_models m ON m.provider_id = p.id AND m.name = x.model_name AND m.deleted_at IS NULL;

INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('ai.prompt_optimize.model_id', '', 'string', 'ai', 0, '智能优化默认文本模型 ID', 11, NOW(3), NOW(3)),
  ('ai.script_generate.model_id', '', 'string', 'ai', 0, '脚本生成默认文本模型 ID', 21, NOW(3), NOW(3)),
  ('ai.prompt_generate.model_id', '', 'string', 'ai', 0, '提示词生成默认文本模型 ID', 31, NOW(3), NOW(3)),
  ('ai.storyboard_generate.model_id', '', 'string', 'ai', 0, 'AI 漫剧分镜默认文本模型 ID', 41, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);

UPDATE system_configs c
JOIN (
  SELECT m.id
    FROM ai_models m
    JOIN ai_model_providers p ON p.id = m.provider_id
   WHERE p.provider_key = 'xiaoma'
     AND p.deleted_at IS NULL
     AND m.name = 'gpt-5.2-chat-latest'
     AND m.model_type = 'text'
     AND m.status = 'active'
   LIMIT 1
) text_model ON 1 = 1
SET c.config_value = CAST(text_model.id AS CHAR),
    c.updated_at = NOW(3)
WHERE c.config_key IN (
  'ai.prompt_optimize.model_id',
  'ai.script_generate.model_id',
  'ai.prompt_generate.model_id',
  'ai.storyboard_generate.model_id'
)
  AND (c.config_value IS NULL OR c.config_value = '' OR c.config_value = '0');
