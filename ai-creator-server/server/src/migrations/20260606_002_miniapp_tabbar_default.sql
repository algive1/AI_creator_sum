INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  (
    'miniapp.tab_bar',
    '[{"text":"首页","pagePath":"/pages/home/index","icon":"home"},{"text":"灵感","pagePath":"/pages/inspiration/index","icon":"spark"},{"text":"漫剧","pagePath":"/pages/comic/index","icon":"film","center":true},{"text":"记录","pagePath":"/pages/history/index","icon":"record"},{"text":"我的","pagePath":"/pages/profile/index","icon":"mine"}]',
    'json',
    'general',
    0,
    '小程序底部导航配置，由后台微信配置页面维护',
    210,
    NOW(3),
    NOW(3)
  )
ON DUPLICATE KEY UPDATE
  config_group = VALUES(config_group),
  value_type = VALUES(value_type),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
