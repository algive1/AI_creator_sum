-- Activate all features needed by the mini program
-- 文生图 / 图生图 / 图片编辑 / 文生视频 / 图生视频 / 首尾帧视频 / 视频编辑 / 提示词优化

-- Add missing features
INSERT IGNORE INTO model_features (feature_key, feature_name, sort_order, status) VALUES
('image_to_image', '图生图', 2, 'active'),
('image_to_video', '图生视频', 6, 'active');

-- Activate existing but disabled features
UPDATE model_features SET status = 'active' WHERE feature_key = 'image_edit' AND status != 'active';
UPDATE model_features SET status = 'active' WHERE feature_key = 'video_edit' AND status != 'active';
UPDATE model_features SET status = 'active' WHERE feature_key = 'prompt_optimize' AND status != 'active';
