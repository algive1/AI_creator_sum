SET @normal_signed_at_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'signin_records' AND column_name = 'normal_signed_at'
);
SET @sql := IF(@normal_signed_at_exists = 0,
  'ALTER TABLE signin_records ADD COLUMN normal_signed_at DATETIME(3) NULL AFTER reward_points',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @super_signed_at_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'signin_records' AND column_name = 'super_signed_at'
);
SET @sql := IF(@super_signed_at_exists = 0,
  'ALTER TABLE signin_records ADD COLUMN super_signed_at DATETIME(3) NULL AFTER normal_signed_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @super_streak_day_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'signin_records' AND column_name = 'super_streak_day'
);
SET @sql := IF(@super_streak_day_exists = 0,
  'ALTER TABLE signin_records ADD COLUMN super_streak_day TINYINT NOT NULL DEFAULT 0 AFTER super_signed_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @super_reward_points_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'signin_records' AND column_name = 'super_reward_points'
);
SET @sql := IF(@super_reward_points_exists = 0,
  'ALTER TABLE signin_records ADD COLUMN super_reward_points INT NOT NULL DEFAULT 0 AFTER super_streak_day',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @normal_is_makeup_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'signin_records' AND column_name = 'normal_is_makeup'
);
SET @sql := IF(@normal_is_makeup_exists = 0,
  'ALTER TABLE signin_records ADD COLUMN normal_is_makeup TINYINT(1) NOT NULL DEFAULT 0 AFTER super_reward_points',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @expires_at_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ad_reward_logs' AND column_name = 'expires_at'
);
SET @sql := IF(@expires_at_exists = 0,
  'ALTER TABLE ad_reward_logs ADD COLUMN expires_at DATETIME(3) NULL AFTER created_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @claimed_at_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ad_reward_logs' AND column_name = 'claimed_at'
);
SET @sql := IF(@claimed_at_exists = 0,
  'ALTER TABLE ad_reward_logs ADD COLUMN claimed_at DATETIME(3) NULL AFTER expires_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('ad.reward.enabled', 'true', 'boolean', 'ads', 0, '是否开启广告积分奖励', 10, NOW(3), NOW(3)),
  ('ad.reward.points_per_watch', '10', 'number', 'ads', 0, '每次观看广告奖励积分', 11, NOW(3), NOW(3)),
  ('ad.reward.max_daily_count', '5', 'number', 'ads', 0, '广告每日最多奖励次数', 12, NOW(3), NOW(3)),
  ('ad.reward.ad_unit_id', '', 'string', 'ads', 0, '微信激励视频广告位 ID', 13, NOW(3), NOW(3)),
  ('signin.enabled', 'true', 'boolean', 'signin', 0, '是否开启签到系统', 20, NOW(3), NOW(3)),
  ('signin.normal_enabled', 'true', 'boolean', 'signin', 0, '是否开启普通签到', 21, NOW(3), NOW(3)),
  ('signin.super_enabled', 'true', 'boolean', 'signin', 0, '是否开启超级签到', 22, NOW(3), NOW(3)),
  ('signin.super_requires_ad', 'true', 'boolean', 'signin', 0, '超级签到是否需要完成广告', 23, NOW(3), NOW(3)),
  ('signin.rewards_json', '[10,15,20,25,30,50,80]', 'json', 'signin', 0, '普通签到连续奖励数组', 24, NOW(3), NOW(3)),
  ('signin.super_rewards_json', '[20,30,40,50,60,80,100]', 'json', 'signin', 0, '超级签到连续奖励数组', 25, NOW(3), NOW(3)),
  ('signin.allow_makeup', 'false', 'boolean', 'signin', 0, '是否允许补签', 26, NOW(3), NOW(3)),
  ('signin.makeup_cost_points', '10', 'number', 'signin', 0, '补签消耗积分', 27, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
