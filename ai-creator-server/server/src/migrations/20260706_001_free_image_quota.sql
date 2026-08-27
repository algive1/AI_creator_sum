CREATE TABLE IF NOT EXISTS user_free_image_quotas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  quota_date DATE NOT NULL,
  used_today INT NOT NULL DEFAULT 0,
  reserved_today INT NOT NULL DEFAULT 0,
  used_total INT NOT NULL DEFAULT 0,
  reserved_total INT NOT NULL DEFAULT 0,
  daily_limit_snapshot INT NOT NULL DEFAULT 0,
  total_limit_snapshot INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_user_id (user_id),
  INDEX idx_quota_date (quota_date),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS free_image_quota_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(16) NOT NULL,
  image_count INT NOT NULL DEFAULT 0,
  quota_date DATE NOT NULL,
  daily_limit_snapshot INT NOT NULL DEFAULT 0,
  total_limit_snapshot INT NOT NULL DEFAULT 0,
  daily_remaining_after INT NOT NULL DEFAULT 0,
  total_remaining_after INT NOT NULL DEFAULT 0,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_task_event (task_id, event_type),
  INDEX idx_user_date (user_id, quota_date, created_at),
  INDEX idx_task_event (task_id, event_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('free_image_quota.enabled', 'false', 'boolean', 'general', 0, '非会员免费生图额度功能开关。关闭后不预占、不展示、不消耗免费额度。', 260, NOW(3), NOW(3)),
  ('free_image_quota.daily_limit', '1', 'number', 'general', 0, '非会员每天可免费生成的图片张数。按图片张数计，不按任务数计。', 261, NOW(3), NOW(3)),
  ('free_image_quota.total_limit', '3', 'number', 'general', 0, '非会员账号总共可免费生成的图片张数。', 262, NOW(3), NOW(3)),
  ('free_image_quota.allowed_tier_keys', 'image_standard,image_pro', 'string', 'general', 0, '允许使用免费生图额度的图片档位 tierKey 白名单，逗号分隔；不在白名单的档位继续使用积分。', 263, NOW(3), NOW(3)),
  ('free_image_quota.show_in_daily_tasks', 'true', 'boolean', 'general', 0, '是否在小程序我的页/每日任务卡片展示今日剩余免费生图额度。', 264, NOW(3), NOW(3)),
  ('free_image_quota.exhausted_message', '今日免费生图额度已用完，可以开通会员获得积分，或使用已有积分继续生成。', 'string', 'general', 0, '免费生图额度不足或用完时展示给用户的运营提示文案。', 265, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
