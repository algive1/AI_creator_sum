INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('miniapp.review_mode_enabled', 'false', 'boolean', 'miniapp_review', 0, '小程序过审模式：开启后隐藏并禁止所有购买、价格、套餐、支付和充值能力', 10, NOW(3), NOW(3)),
  ('miniapp.purchase_enabled', 'true', 'boolean', 'miniapp_review', 0, '小程序购买能力总开关：关闭后积分购买、会员购买和微信支付下单均不可用', 20, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
