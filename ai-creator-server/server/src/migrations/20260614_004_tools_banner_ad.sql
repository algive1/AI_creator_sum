INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('tools.banner_ad_unit_id', '', 'string', 'tools', 0, '工具执行页横幅广告位 ID，未配置时小程序不展示横幅广告', 47, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
