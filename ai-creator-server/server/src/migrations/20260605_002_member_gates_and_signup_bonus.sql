INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('membership.prompt_optimize_member_only', 'false', 'boolean', 'general', 0, '智能优化提示词是否仅会员可用', 31, NOW(3), NOW(3)),
  ('membership.image_template_use_member_only', 'false', 'boolean', 'general', 0, '图片模板使用是否仅会员可用', 32, NOW(3), NOW(3)),
  ('membership.save_to_album_member_only', 'false', 'boolean', 'general', 0, '保存作品到相册是否仅会员可用', 33, NOW(3), NOW(3)),
  ('points.new_user_bonus_points', '50', 'number', 'points', 0, '新用户首次登录/注册赠送积分', 10, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
