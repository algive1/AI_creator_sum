-- seed_phase7.sql
-- 默认会员权益和积分规则

INSERT INTO member_plan_point_rules (plan_id, total_points, immediate_points, monthly_points, gift_points, grant_mode, points_expire_type, points_discount_rate)
SELECT p.id, v.total_points, v.immediate_points, v.monthly_points, v.gift_points, v.grant_mode, v.points_expire_type, v.points_discount_rate
FROM (
  SELECT 'pro_month' AS plan_key, 500 AS total_points, 500 AS immediate_points, 0 AS monthly_points, 0 AS gift_points, 'immediate' AS grant_mode, 'with_membership' AS points_expire_type, 0.90 AS points_discount_rate
  UNION ALL SELECT 'pro_quarter', 1800, 600, 400, 0, 'mixed', 'with_membership', 0.90
  UNION ALL SELECT 'pro_year', 8000, 2000, 500, 1000, 'mixed', 'with_membership', 0.80
  UNION ALL SELECT 'biz_month', 2000, 2000, 0, 0, 'immediate', 'with_membership', 0.85
  UNION ALL SELECT 'biz_quarter', 7500, 2500, 1666, 0, 'mixed', 'with_membership', 0.80
  UNION ALL SELECT 'biz_year', 36000, 9000, 2250, 5000, 'mixed', 'with_membership', 0.70
) v
JOIN member_plans p ON p.plan_key = v.plan_key
ON DUPLICATE KEY UPDATE
  total_points = VALUES(total_points),
  immediate_points = VALUES(immediate_points),
  monthly_points = VALUES(monthly_points),
  gift_points = VALUES(gift_points),
  grant_mode = VALUES(grant_mode),
  points_expire_type = VALUES(points_expire_type),
  points_discount_rate = VALUES(points_discount_rate);

INSERT INTO member_plan_rights (plan_id, right_key, right_name, right_value, right_category, icon_url, sort_order)
SELECT p.id, v.right_key, v.right_name, v.right_value, v.right_category, v.icon_url, v.sort_order
FROM (
  SELECT 'pro_month' AS plan_key, 'image_daily' AS right_key, 'AI 生图' AS right_name, '每日 100 张' AS right_value, 'image' AS right_category, '/assets/member-benefit-icons/benefit_hd_quality.svg' AS icon_url, 1 AS sort_order
  UNION ALL SELECT 'pro_month', 'video_monthly', 'AI 生视频', '每月 30 次', 'video', '/assets/member-benefit-icons/benefit_ai_video.svg', 2
  UNION ALL SELECT 'pro_month', 'max_quality', '导出画质', '1080P', 'export', '/assets/member-benefit-icons/benefit_hd_quality.svg', 3
  UNION ALL SELECT 'pro_month', 'watermark_removal', '去水印', 'true', 'export', '/assets/member-benefit-icons/benefit_remove_watermark.svg', 4
  UNION ALL SELECT 'pro_year', 'image_daily', 'AI 生图', '每日 500 张', 'image', '/assets/member-benefit-icons/benefit_hd_quality.svg', 1
  UNION ALL SELECT 'pro_year', 'video_monthly', 'AI 生视频', '每月 150 次', 'video', '/assets/member-benefit-icons/benefit_ai_video.svg', 2
  UNION ALL SELECT 'pro_year', 'max_quality', '导出画质', '2K', 'export', '/assets/member-benefit-icons/benefit_hd_quality.svg', 3
  UNION ALL SELECT 'pro_year', 'watermark_removal', '去水印', 'true', 'export', '/assets/member-benefit-icons/benefit_remove_watermark.svg', 4
  UNION ALL SELECT 'pro_year', 'exclusive_model', '专属模型', 'true', 'model', '/assets/member-benefit-icons/benefit_materials.svg', 5
  UNION ALL SELECT 'pro_year', 'commercial_license', '商用授权', 'true', 'business', '/assets/member-benefit-icons/benefit_commercial.svg', 6
  UNION ALL SELECT 'pro_year', 'priority_generation', '优先生成', 'true', 'queue', '/assets/member-benefit-icons/benefit_priority.svg', 7
  UNION ALL SELECT 'biz_year', 'image_daily', 'AI 生图', '无限制', 'image', '/assets/member-benefit-icons/benefit_hd_quality.svg', 1
  UNION ALL SELECT 'biz_year', 'video_monthly', 'AI 生视频', '无限制', 'video', '/assets/member-benefit-icons/benefit_ai_video.svg', 2
  UNION ALL SELECT 'biz_year', 'max_quality', '导出画质', '4K', 'export', '/assets/member-benefit-icons/benefit_hd_quality.svg', 3
  UNION ALL SELECT 'biz_year', 'watermark_removal', '去水印', 'true', 'export', '/assets/member-benefit-icons/benefit_remove_watermark.svg', 4
  UNION ALL SELECT 'biz_year', 'exclusive_model', '专属模型', 'true', 'model', '/assets/member-benefit-icons/benefit_materials.svg', 5
  UNION ALL SELECT 'biz_year', 'commercial_license', '商用授权', 'true', 'business', '/assets/member-benefit-icons/benefit_commercial.svg', 6
  UNION ALL SELECT 'biz_year', 'priority_generation', '优先生成', 'true', 'queue', '/assets/member-benefit-icons/benefit_priority.svg', 7
  UNION ALL SELECT 'biz_year', 'team_seats', '团队席位', '5', 'business', '/assets/member-benefit-icons/benefit_team_seats.svg', 8
  UNION ALL SELECT 'biz_year', 'enterprise_invoice', '企业发票', 'true', 'business', '/assets/member-benefit-icons/benefit_invoice.svg', 9
) v
JOIN member_plans p ON p.plan_key = v.plan_key
ON DUPLICATE KEY UPDATE
  right_name = VALUES(right_name),
  right_value = VALUES(right_value),
  right_category = VALUES(right_category),
  icon_url = VALUES(icon_url),
  sort_order = VALUES(sort_order);
