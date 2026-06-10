SET @ad_scene_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ad_reward_logs' AND column_name = 'ad_scene'
);
SET @sql := IF(@ad_scene_exists = 0,
  'ALTER TABLE ad_reward_logs ADD COLUMN ad_scene VARCHAR(32) NOT NULL DEFAULT ''reward'' AFTER session_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE ad_reward_logs
   SET ad_scene = 'reward'
 WHERE ad_scene IS NULL OR ad_scene = '';

SET @scene_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ad_reward_logs' AND index_name = 'idx_ad_reward_scene_user_date'
);
SET @sql := IF(@scene_index_exists = 0,
  'ALTER TABLE ad_reward_logs ADD INDEX idx_ad_reward_scene_user_date (ad_scene, user_id, ad_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
