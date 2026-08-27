INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('tools.prompt_reverse.points_enabled', 'false', 'boolean', 'tools', 0, '反推提示词是否启用工具积分收费', 31, NOW(3), NOW(3)),
  ('tools.prompt_reverse.points_cost', '0', 'number', 'tools', 0, '反推提示词每次积分收费数量', 32, NOW(3), NOW(3)),
  ('tools.grid_cut.points_enabled', 'false', 'boolean', 'tools', 0, '九宫格切图是否启用工具积分收费', 33, NOW(3), NOW(3)),
  ('tools.grid_cut.points_cost', '0', 'number', 'tools', 0, '九宫格切图每次积分收费数量', 34, NOW(3), NOW(3)),
  ('tools.image_compress.points_enabled', 'false', 'boolean', 'tools', 0, '图片压缩是否启用工具积分收费', 35, NOW(3), NOW(3)),
  ('tools.image_compress.points_cost', '0', 'number', 'tools', 0, '图片压缩每次积分收费数量', 36, NOW(3), NOW(3)),
  ('tools.watermark.points_enabled', 'false', 'boolean', 'tools', 0, '图片加水印是否启用工具积分收费', 37, NOW(3), NOW(3)),
  ('tools.watermark.points_cost', '0', 'number', 'tools', 0, '图片加水印每次积分收费数量', 38, NOW(3), NOW(3)),
  ('tools.compare.points_enabled', 'false', 'boolean', 'tools', 0, '双图对比是否启用工具积分收费', 39, NOW(3), NOW(3)),
  ('tools.compare.points_cost', '0', 'number', 'tools', 0, '双图对比每次积分收费数量', 40, NOW(3), NOW(3)),
  ('tools.cutout.points_enabled', 'false', 'boolean', 'tools', 0, '智能抠图是否启用工具积分收费', 41, NOW(3), NOW(3)),
  ('tools.cutout.points_cost', '0', 'number', 'tools', 0, '智能抠图每次积分收费数量', 42, NOW(3), NOW(3)),
  ('tools.resize.points_enabled', 'false', 'boolean', 'tools', 0, '尺寸调整是否启用工具积分收费', 43, NOW(3), NOW(3)),
  ('tools.resize.points_cost', '0', 'number', 'tools', 0, '尺寸调整每次积分收费数量', 44, NOW(3), NOW(3)),
  ('tools.phone_frame.points_enabled', 'false', 'boolean', 'tools', 0, '截图加手机壳是否启用工具积分收费', 45, NOW(3), NOW(3)),
  ('tools.phone_frame.points_cost', '0', 'number', 'tools', 0, '截图加手机壳每次积分收费数量', 46, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  description = VALUES(description),
  sort_order = VALUES(sort_order);
