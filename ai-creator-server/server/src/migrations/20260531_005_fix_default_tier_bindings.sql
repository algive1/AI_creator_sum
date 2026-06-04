-- Fix default frontend feature tiers and bindings.
-- Real API keys are still configured by operators in the admin panel.

INSERT INTO model_features (feature_key, feature_name, sort_order, status) VALUES
('image_create', 'AI 生图', 1, 'active'),
('image_to_image', '图生图', 2, 'active'),
('image_edit', '图片编辑', 3, 'active'),
('video_create', 'AI 生视频', 4, 'active'),
('image_to_video', '图生视频', 5, 'active'),
('first_last_frame_video', '首尾帧视频', 6, 'active'),
('video_edit', '视频编辑', 7, 'active'),
('prompt_optimize', '提示词优化', 8, 'active')
ON DUPLICATE KEY UPDATE
  feature_name = VALUES(feature_name),
  sort_order = VALUES(sort_order),
  status = VALUES(status);

INSERT INTO model_tiers (feature_id, tier_name, tier_key, description, tag, points_cost, is_default, is_recommended, sort_order, status) VALUES
((SELECT id FROM model_features WHERE feature_key='image_to_image'), '标准图生图', 'image_to_image_standard', '上传参考图生成新图', '', 3, 1, 0, 1, 'active'),
((SELECT id FROM model_features WHERE feature_key='image_edit'), '标准图片编辑', 'image_edit_standard', '上传图片进行局部修改', '', 3, 1, 0, 1, 'active'),
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

UPDATE ai_model_providers
SET api_key = ''
WHERE api_key LIKE 'sk-your-%' OR api_key LIKE 'your-%' OR api_key LIKE 'please_change%';

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
