INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('miniapp.home_entry.image.enabled', 'true', 'boolean', 'miniapp_home_entry', 0, '小程序首页生图入口是否可进入', 10, NOW(3), NOW(3)),
  ('miniapp.home_entry.image.message', '生图功能维护中，请稍后再试', 'string', 'miniapp_home_entry', 0, '小程序首页生图入口关闭时提示文案', 11, NOW(3), NOW(3)),
  ('miniapp.home_entry.video.enabled', 'true', 'boolean', 'miniapp_home_entry', 0, '小程序首页生视频入口是否可进入', 20, NOW(3), NOW(3)),
  ('miniapp.home_entry.video.message', '生视频功能维护中，请稍后再试', 'string', 'miniapp_home_entry', 0, '小程序首页生视频入口关闭时提示文案', 21, NOW(3), NOW(3)),
  ('miniapp.home_entry.comic.enabled', 'true', 'boolean', 'miniapp_home_entry', 0, '小程序首页生漫剧入口是否可进入', 30, NOW(3), NOW(3)),
  ('miniapp.home_entry.comic.message', '生漫剧功能维护中，请稍后再试', 'string', 'miniapp_home_entry', 0, '小程序首页生漫剧入口关闭时提示文案', 31, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  description = VALUES(description),
  sort_order = VALUES(sort_order);
