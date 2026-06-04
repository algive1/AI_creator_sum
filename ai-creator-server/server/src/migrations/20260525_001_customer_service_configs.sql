INSERT IGNORE INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('customer_service.enabled', 'true', 'boolean', 'customer_service', 0, '是否开启小程序客服入口', 10, NOW(3), NOW(3)),
  ('customer_service.title', '联系客服', 'string', 'customer_service', 0, '小程序个人中心客服入口名称', 20, NOW(3), NOW(3)),
  ('customer_service.subtitle', '订单、会员、生成问题都可以咨询', 'string', 'customer_service', 0, '小程序个人中心客服入口描述', 30, NOW(3), NOW(3)),
  ('customer_service.icon', 'customer-service', 'string', 'customer_service', 0, '客服入口图标标识', 40, NOW(3), NOW(3)),
  ('customer_service.show_in_profile', 'true', 'boolean', 'customer_service', 0, '是否显示在个人中心', 50, NOW(3), NOW(3)),
  ('customer_service.session_from', 'profile', 'string', 'customer_service', 0, '微信客服会话来源 sessionFrom', 60, NOW(3), NOW(3)),
  ('customer_service.show_message_card', 'true', 'boolean', 'customer_service', 0, '是否向客服发送小程序卡片', 70, NOW(3), NOW(3)),
  ('customer_service.send_message_title', 'AI创作助手客服咨询', 'string', 'customer_service', 0, '小程序客服卡片标题', 80, NOW(3), NOW(3)),
  ('customer_service.send_message_path', '/pages/user/index', 'string', 'customer_service', 0, '小程序客服卡片路径', 90, NOW(3), NOW(3)),
  ('customer_service.send_message_img', '', 'string', 'customer_service', 0, '小程序客服卡片 HTTPS 图片 URL，可为空', 100, NOW(3), NOW(3));
