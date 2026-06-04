INSERT IGNORE INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('miniapp_help.enabled', 'true', 'boolean', 'miniapp_help', 0, '是否启用小程序使用帮助内容配置', 10, NOW(3), NOW(3)),
  ('miniapp_help.title', '使用帮助', 'string', 'miniapp_help', 0, '小程序使用帮助标题', 20, NOW(3), NOW(3)),
  ('miniapp_help.content_html', '', 'html', 'miniapp_help', 0, '小程序使用帮助 HTML 富文本内容', 30, NOW(3), NOW(3));
