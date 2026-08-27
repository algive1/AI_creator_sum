INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('free_image_quota.allowed_tier_keys', 'image_standard,image_pro', 'string', 'general', 0, '允许使用免费生图额度的图片档位 tierKey 白名单，逗号分隔；不在白名单的档位继续使用积分。', 263, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
