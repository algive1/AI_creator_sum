-- Activate video_edit + add first_last_frame_video feature
UPDATE model_features SET status = 'active' WHERE feature_key = 'video_edit';

INSERT IGNORE INTO model_features (feature_key, feature_name, sort_order, status)
VALUES ('first_last_frame_video', '首尾帧视频', 5, 'active');
