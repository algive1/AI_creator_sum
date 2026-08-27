INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  (
    'tools.visible_keys',
    '["prompt_reverse","grid_cut","image_compress","watermark","compare","cutout","resize","phone_frame"]',
    'json',
    'tools',
    0,
    '工具箱当前展示的内置工具 key 列表，顺序即小程序展示顺序；移出工具仅从此列表删除，不清空历史配置或日志',
    11,
    NOW(3),
    NOW(3)
  )
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  description = VALUES(description),
  sort_order = VALUES(sort_order);
