CREATE TABLE IF NOT EXISTS member_benefit_icons (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  icon_key VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  icon_url VARCHAR(512) NOT NULL,
  icon_file_id BIGINT UNSIGNED NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'seed',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_icon_key (icon_key),
  INDEX idx_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_plan_rights' AND column_name = 'icon_url'
);
SET @sql := IF(@col = 0, 'ALTER TABLE member_plan_rights ADD COLUMN icon_url VARCHAR(512) NOT NULL DEFAULT '''' AFTER right_category', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_plan_rights' AND column_name = 'icon_file_id'
);
SET @sql := IF(@col = 0, 'ALTER TABLE member_plan_rights ADD COLUMN icon_file_id BIGINT UNSIGNED NULL AFTER icon_url', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_plan_rights' AND index_name = 'idx_icon_file'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE member_plan_rights ADD INDEX idx_icon_file (icon_file_id)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

INSERT INTO member_benefit_icons (icon_key, name, icon_url, source, sort_order)
VALUES
  ('hd_quality', '高清画质', '/assets/member-benefit-icons/benefit_hd_quality.svg', 'seed', 10),
  ('ai_video', 'AI 视频', '/assets/member-benefit-icons/benefit_ai_video.svg', 'seed', 20),
  ('ai_comic', 'AI 漫画', '/assets/member-benefit-icons/benefit_ai_comic.svg', 'seed', 30),
  ('remove_watermark', '去水印', '/assets/member-benefit-icons/benefit_remove_watermark.svg', 'seed', 40),
  ('materials', '专属素材', '/assets/member-benefit-icons/benefit_materials.svg', 'seed', 50),
  ('priority', '优先处理', '/assets/member-benefit-icons/benefit_priority.svg', 'seed', 60),
  ('commercial', '商用授权', '/assets/member-benefit-icons/benefit_commercial.svg', 'seed', 70),
  ('customer_service', '专属客服', '/assets/member-benefit-icons/benefit_customer_service.svg', 'seed', 80),
  ('points_bonus', '积分赠送', '/assets/member-benefit-icons/benefit_points_bonus.svg', 'seed', 90),
  ('fast_queue', '极速队列', '/assets/member-benefit-icons/benefit_fast_queue.svg', 'seed', 100),
  ('batch_create', '批量创作', '/assets/member-benefit-icons/benefit_batch_create.svg', 'seed', 110),
  ('cloud_storage', '云端存储', '/assets/member-benefit-icons/benefit_cloud_storage.svg', 'seed', 120),
  ('private_model', '私有模型', '/assets/member-benefit-icons/benefit_private_model.svg', 'seed', 130),
  ('team_seats', '团队席位', '/assets/member-benefit-icons/benefit_team_seats.svg', 'seed', 140),
  ('invoice', '企业发票', '/assets/member-benefit-icons/benefit_invoice.svg', 'seed', 150),
  ('api_access', 'API 接入', '/assets/member-benefit-icons/benefit_api_access.svg', 'seed', 160),
  ('brand_assets', '品牌素材', '/assets/member-benefit-icons/benefit_brand_assets.svg', 'seed', 170),
  ('prompt_library', '提示词库', '/assets/member-benefit-icons/benefit_prompt_library.svg', 'seed', 180),
  ('template_vip', '会员模板', '/assets/member-benefit-icons/benefit_template_vip.svg', 'seed', 190),
  ('privacy', '隐私保护', '/assets/member-benefit-icons/benefit_privacy.svg', 'seed', 200),
  ('copyright', '版权保障', '/assets/member-benefit-icons/benefit_copyright.svg', 'seed', 210),
  ('training', '教程培训', '/assets/member-benefit-icons/benefit_training.svg', 'seed', 220),
  ('analytics', '数据看板', '/assets/member-benefit-icons/benefit_analytics.svg', 'seed', 230),
  ('early_access', '新品抢先', '/assets/member-benefit-icons/benefit_early_access.svg', 'seed', 240),
  ('export_pack', '导出包', '/assets/member-benefit-icons/benefit_export_pack.svg', 'seed', 250),
  ('collaboration', '协作权限', '/assets/member-benefit-icons/benefit_collaboration.svg', 'seed', 260),
  ('dedicated_support', '专属顾问', '/assets/member-benefit-icons/benefit_dedicated_support.svg', 'seed', 270),
  ('quality_boost', '画质增强', '/assets/member-benefit-icons/benefit_quality_boost.svg', 'seed', 280)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  icon_url = VALUES(icon_url),
  source = VALUES(source),
  sort_order = VALUES(sort_order),
  status = 'active',
  updated_at = NOW(3);

UPDATE member_plan_rights
   SET icon_url = CASE
     WHEN right_key = 'image_daily' THEN '/assets/member-benefit-icons/benefit_hd_quality.svg'
     WHEN right_key = 'video_monthly' THEN '/assets/member-benefit-icons/benefit_ai_video.svg'
     WHEN right_key = 'max_quality' THEN '/assets/member-benefit-icons/benefit_hd_quality.svg'
     WHEN right_key = 'watermark_removal' THEN '/assets/member-benefit-icons/benefit_remove_watermark.svg'
     WHEN right_key = 'exclusive_model' THEN '/assets/member-benefit-icons/benefit_materials.svg'
     WHEN right_key = 'commercial_license' THEN '/assets/member-benefit-icons/benefit_commercial.svg'
     WHEN right_key = 'priority_generation' THEN '/assets/member-benefit-icons/benefit_priority.svg'
     WHEN right_key = 'team_seats' THEN '/assets/member-benefit-icons/benefit_team_seats.svg'
     WHEN right_key = 'enterprise_invoice' THEN '/assets/member-benefit-icons/benefit_invoice.svg'
     ELSE icon_url
   END
 WHERE icon_url = '';
