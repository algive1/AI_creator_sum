CREATE TABLE IF NOT EXISTS tool_usage_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tool_key VARCHAR(64) NOT NULL,
  usage_date DATE NOT NULL,
  usage_source VARCHAR(32) NOT NULL DEFAULT 'quota',
  input_file_ids JSON NULL,
  output_file_ids JSON NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX idx_user_tool_date (user_id, tool_key, usage_date),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Mini program tool usage logs';

CREATE TABLE IF NOT EXISTS tool_ad_unlocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tool_key VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  ad_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  used_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX uk_session (session_id),
  INDEX idx_user_tool_status (user_id, tool_key, status),
  INDEX idx_user_date (user_id, ad_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Rewarded-ad unlock sessions for mini program tools';

INSERT INTO model_features (feature_key, feature_name, sort_order, status)
VALUES
  ('tool_prompt_reverse', '工具-反推提示词', 80, 'active'),
  ('tool_cutout', '工具-智能抠图', 81, 'active')
ON DUPLICATE KEY UPDATE
  feature_name = VALUES(feature_name),
  sort_order = VALUES(sort_order),
  status = VALUES(status);

INSERT INTO model_tiers
  (feature_id, tier_name, tier_key, description, tag, points_cost, is_default, is_recommended, sort_order, status, quality_multipliers, created_at, updated_at)
SELECT f.id, '标准反推提示词', 'tool_prompt_reverse_standard', '上传图片后由绑定模型生成提示词', '', 0, 1, 0, 10, 'active', '{}', NOW(3), NOW(3)
  FROM model_features f
 WHERE f.feature_key = 'tool_prompt_reverse'
   AND NOT EXISTS (SELECT 1 FROM model_tiers t WHERE t.tier_key = 'tool_prompt_reverse_standard')
UNION ALL
SELECT f.id, '标准智能抠图', 'tool_cutout_standard', '上传图片后由绑定模型或本地兜底处理抠图', '', 0, 1, 0, 10, 'active', '{}', NOW(3), NOW(3)
  FROM model_features f
 WHERE f.feature_key = 'tool_cutout'
   AND NOT EXISTS (SELECT 1 FROM model_tiers t WHERE t.tier_key = 'tool_cutout_standard');

INSERT INTO tier_capabilities
  (tier_id, supported_ratios, supported_qualities, supported_styles, supported_size_modes, native_sizes, postprocess_modes, max_images, max_reference_images, min_reference_images, reference_upload_mode, required_reference, created_at, updated_at)
SELECT t.id, '[]', '[]', '[]', '["auto"]', '[]', '[]', 1, 1, 1, 'first_frame', 1, NOW(3), NOW(3)
  FROM model_tiers t
  JOIN model_features f ON f.id = t.feature_id
 WHERE f.feature_key IN ('tool_prompt_reverse', 'tool_cutout')
   AND NOT EXISTS (SELECT 1 FROM tier_capabilities c WHERE c.tier_id = t.id);

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('tools.enabled', 'true', 'boolean', 'tools', 0, '工具页总开关', 10, NOW(3), NOW(3)),
  ('tools.prompt_reverse.enabled', 'true', 'boolean', 'tools', 0, '反推提示词工具开关', 20, NOW(3), NOW(3)),
  ('tools.prompt_reverse.member_daily_quota', '20', 'number', 'tools', 0, '会员每日反推提示词免费次数', 21, NOW(3), NOW(3)),
  ('tools.prompt_reverse.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日反推提示词免费次数', 22, NOW(3), NOW(3)),
  ('tools.prompt_reverse.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁反推提示词', 23, NOW(3), NOW(3)),
  ('tools.prompt_reverse.message', '反推提示词功能维护中，请稍后再试', 'string', 'tools', 0, '反推提示词关闭提示', 24, NOW(3), NOW(3)),
  ('tools.grid_cut.enabled', 'true', 'boolean', 'tools', 0, '九宫格切图工具开关', 30, NOW(3), NOW(3)),
  ('tools.grid_cut.member_daily_quota', '50', 'number', 'tools', 0, '会员每日九宫格切图免费次数', 31, NOW(3), NOW(3)),
  ('tools.grid_cut.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日九宫格切图免费次数', 32, NOW(3), NOW(3)),
  ('tools.grid_cut.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁九宫格切图', 33, NOW(3), NOW(3)),
  ('tools.grid_cut.message', '九宫格切图功能维护中，请稍后再试', 'string', 'tools', 0, '九宫格切图关闭提示', 34, NOW(3), NOW(3)),
  ('tools.image_compress.enabled', 'true', 'boolean', 'tools', 0, '图片压缩工具开关', 40, NOW(3), NOW(3)),
  ('tools.image_compress.member_daily_quota', '50', 'number', 'tools', 0, '会员每日图片压缩免费次数', 41, NOW(3), NOW(3)),
  ('tools.image_compress.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日图片压缩免费次数', 42, NOW(3), NOW(3)),
  ('tools.image_compress.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁图片压缩', 43, NOW(3), NOW(3)),
  ('tools.image_compress.message', '图片压缩功能维护中，请稍后再试', 'string', 'tools', 0, '图片压缩关闭提示', 44, NOW(3), NOW(3)),
  ('tools.watermark.enabled', 'true', 'boolean', 'tools', 0, '图片加水印工具开关', 50, NOW(3), NOW(3)),
  ('tools.watermark.member_daily_quota', '50', 'number', 'tools', 0, '会员每日图片加水印免费次数', 51, NOW(3), NOW(3)),
  ('tools.watermark.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日图片加水印免费次数', 52, NOW(3), NOW(3)),
  ('tools.watermark.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁图片加水印', 53, NOW(3), NOW(3)),
  ('tools.watermark.message', '图片加水印功能维护中，请稍后再试', 'string', 'tools', 0, '图片加水印关闭提示', 54, NOW(3), NOW(3)),
  ('tools.compare.enabled', 'true', 'boolean', 'tools', 0, '双图对比工具开关', 60, NOW(3), NOW(3)),
  ('tools.compare.member_daily_quota', '50', 'number', 'tools', 0, '会员每日双图对比免费次数', 61, NOW(3), NOW(3)),
  ('tools.compare.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日双图对比免费次数', 62, NOW(3), NOW(3)),
  ('tools.compare.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁双图对比', 63, NOW(3), NOW(3)),
  ('tools.compare.message', '双图对比功能维护中，请稍后再试', 'string', 'tools', 0, '双图对比关闭提示', 64, NOW(3), NOW(3)),
  ('tools.cutout.enabled', 'true', 'boolean', 'tools', 0, '智能抠图工具开关', 70, NOW(3), NOW(3)),
  ('tools.cutout.member_daily_quota', '20', 'number', 'tools', 0, '会员每日智能抠图免费次数', 71, NOW(3), NOW(3)),
  ('tools.cutout.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日智能抠图免费次数', 72, NOW(3), NOW(3)),
  ('tools.cutout.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁智能抠图', 73, NOW(3), NOW(3)),
  ('tools.cutout.message', '智能抠图功能维护中，请稍后再试', 'string', 'tools', 0, '智能抠图关闭提示', 74, NOW(3), NOW(3)),
  ('tools.resize.enabled', 'true', 'boolean', 'tools', 0, '尺寸调整工具开关', 80, NOW(3), NOW(3)),
  ('tools.resize.member_daily_quota', '50', 'number', 'tools', 0, '会员每日尺寸调整免费次数', 81, NOW(3), NOW(3)),
  ('tools.resize.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日尺寸调整免费次数', 82, NOW(3), NOW(3)),
  ('tools.resize.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁尺寸调整', 83, NOW(3), NOW(3)),
  ('tools.resize.message', '尺寸调整功能维护中，请稍后再试', 'string', 'tools', 0, '尺寸调整关闭提示', 84, NOW(3), NOW(3)),
  ('tools.phone_frame.enabled', 'true', 'boolean', 'tools', 0, '截图加手机壳工具开关', 90, NOW(3), NOW(3)),
  ('tools.phone_frame.member_daily_quota', '50', 'number', 'tools', 0, '会员每日截图加手机壳免费次数', 91, NOW(3), NOW(3)),
  ('tools.phone_frame.guest_daily_quota', '0', 'number', 'tools', 0, '非会员每日截图加手机壳免费次数', 92, NOW(3), NOW(3)),
  ('tools.phone_frame.ad_unlock_enabled', 'true', 'boolean', 'tools', 0, '非会员看广告解锁截图加手机壳', 93, NOW(3), NOW(3)),
  ('tools.phone_frame.message', '截图加手机壳功能维护中，请稍后再试', 'string', 'tools', 0, '截图加手机壳关闭提示', 94, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  (
    'miniapp.tab_bar',
    '[{"text":"首页","pagePath":"/pages/home/index","icon":"home"},{"text":"灵感","pagePath":"/pages/inspiration/index","icon":"spark"},{"text":"工具","pagePath":"/pages/tools/index","icon":"tools"},{"text":"记录","pagePath":"/pages/history/index","icon":"record"},{"text":"我的","pagePath":"/pages/profile/index","icon":"mine"}]',
    'json',
    'general',
    0,
    '小程序底部导航配置，前端仅展示前 5 个启用项',
    210,
    NOW(3),
    NOW(3)
  )
ON DUPLICATE KEY UPDATE
  config_group = VALUES(config_group),
  value_type = VALUES(value_type),
  description = VALUES(description),
  sort_order = VALUES(sort_order);
