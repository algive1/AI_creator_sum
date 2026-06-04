INSERT IGNORE INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('miniapp_visual_assets.home_banner_url', '', 'string', 'miniapp_visual_assets', 0, '小程序首页顶部 Banner HTTPS 图片 URL', 10, NOW(3), NOW(3)),
  ('miniapp_visual_assets.home_member_upsell_url', '', 'string', 'miniapp_visual_assets', 0, '小程序首页会员悬浮引导 HTTPS 图片 URL', 20, NOW(3), NOW(3)),
  ('miniapp_visual_assets.inspiration_banner_url', '', 'string', 'miniapp_visual_assets', 0, '小程序灵感页顶部 Banner HTTPS 图片 URL', 30, NOW(3), NOW(3)),
  ('miniapp_visual_assets.comic_banner_url', '', 'string', 'miniapp_visual_assets', 0, '小程序 AI 漫剧页顶部 Banner HTTPS 图片 URL', 40, NOW(3), NOW(3)),
  ('miniapp_visual_assets.profile_member_offer_banner_url', '', 'string', 'miniapp_visual_assets', 0, '小程序我的页会员套餐入口 Banner HTTPS 图片 URL', 50, NOW(3), NOW(3));
