INSERT IGNORE INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('miniapp_help.items_json', '[]', 'json', 'miniapp_help', 0, '小程序使用帮助多条内容 JSON', 40, NOW(3), NOW(3)),
  ('miniapp_prompt_guides.enabled', 'true', 'boolean', 'miniapp_prompt_guides', 0, '是否启用生成页提示词引导配置', 10, NOW(3), NOW(3)),
  ('miniapp_prompt_guides.items_json', '{}', 'json', 'miniapp_prompt_guides', 0, '按生成模式配置提示词占位文字和帮助弹层文案', 20, NOW(3), NOW(3));
