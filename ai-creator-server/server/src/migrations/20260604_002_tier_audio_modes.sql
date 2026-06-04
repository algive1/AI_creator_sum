SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'supported_audio_modes'
);
SET @sql := IF(@col = 0, 'ALTER TABLE tier_capabilities ADD COLUMN supported_audio_modes JSON NULL AFTER supported_camera_moves', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'default_audio_mode'
);
SET @sql := IF(@col = 0, 'ALTER TABLE tier_capabilities ADD COLUMN default_audio_mode VARCHAR(32) NOT NULL DEFAULT ''silent'' AFTER supported_audio_modes', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE tier_capabilities c
JOIN model_tiers t ON t.id = c.tier_id
JOIN model_features f ON f.id = t.feature_id
   SET c.supported_audio_modes = COALESCE(c.supported_audio_modes, JSON_ARRAY('silent')),
       c.default_audio_mode = COALESCE(NULLIF(c.default_audio_mode, ''), 'silent')
 WHERE f.feature_key IN ('video_create', 'image_to_video', 'first_last_frame_video');
