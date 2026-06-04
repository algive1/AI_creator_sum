CREATE TABLE IF NOT EXISTS legal_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_type VARCHAR(32) NOT NULL COMMENT 'user_agreement/privacy_policy/ai_content_rules/public_template_rules',
  title VARCHAR(128) NOT NULL,
  version VARCHAR(32) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  effective_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_doc_version (doc_type, version),
  INDEX idx_doc_enabled (doc_type, enabled, effective_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_legal_acceptances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  doc_type VARCHAR(32) NOT NULL,
  doc_version VARCHAR(32) NOT NULL,
  accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  scene VARCHAR(32) NOT NULL DEFAULT 'first_open',
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NOT NULL DEFAULT '',
  UNIQUE INDEX uk_user_doc_version (user_id, doc_type, doc_version),
  INDEX idx_user_doc (user_id, doc_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'popup',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  start_at DATETIME(3) NULL,
  end_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 0,
  show_frequency VARCHAR(32) NOT NULL DEFAULT 'once_per_day',
  target_type VARCHAR(32) NOT NULL DEFAULT 'all',
  target_user_ids JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  INDEX idx_announcement_visible (enabled, type, start_at, end_at, deleted_at),
  INDEX idx_announcement_sort (priority, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcement_user_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  announcement_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  first_seen_at DATETIME(3) NULL,
  last_popup_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  closed_at DATETIME(3) NULL,
  popup_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_announcement_user (announcement_id, user_id),
  INDEX idx_user_popup (user_id, last_popup_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_compliance_confirmations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  scene VARCHAR(32) NOT NULL COMMENT 'export_save/share/public_template',
  task_id BIGINT UNSIGNED NULL,
  file_id BIGINT UNSIGNED NULL,
  template_id BIGINT UNSIGNED NULL,
  confirmation_text VARCHAR(64) NOT NULL DEFAULT '',
  required_text VARCHAR(64) NOT NULL DEFAULT '',
  policy_version VARCHAR(32) NOT NULL DEFAULT '',
  confirmed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NOT NULL DEFAULT '',
  INDEX idx_user_scene (user_id, scene, confirmed_at),
  INDEX idx_task_file (task_id, file_id),
  INDEX idx_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_prompts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prompt_key VARCHAR(64) NOT NULL,
  prompt_name VARCHAR(128) NOT NULL,
  prompt_type VARCHAR(32) NOT NULL DEFAULT 'system',
  target_feature VARCHAR(64) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  version VARCHAR(32) NOT NULL DEFAULT 'v1',
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_prompt_version (prompt_key, version),
  INDEX idx_prompt_lookup (target_feature, prompt_type, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  description VARCHAR(512) NOT NULL DEFAULT '',
  template_type VARCHAR(32) NOT NULL DEFAULT 'image',
  target_feature VARCHAR(64) NOT NULL DEFAULT 'text_to_image',
  source VARCHAR(16) NOT NULL DEFAULT 'official',
  user_id BIGINT UNSIGNED NULL,
  task_id BIGINT UNSIGNED NULL,
  output_id BIGINT UNSIGNED NULL,
  cover_file_id BIGINT UNSIGNED NULL,
  cover_url VARCHAR(1024) NOT NULL DEFAULT '',
  preview_file_id BIGINT UNSIGNED NULL,
  preview_url VARCHAR(1024) NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  negative_prompt TEXT NULL,
  params_json JSON NOT NULL DEFAULT ('{}'),
  ratio VARCHAR(32) NOT NULL DEFAULT '',
  width INT NOT NULL DEFAULT 0,
  height INT NOT NULL DEFAULT 0,
  duration INT NULL,
  style VARCHAR(64) NOT NULL DEFAULT '',
  scene VARCHAR(64) NOT NULL DEFAULT '',
  category_id BIGINT UNSIGNED NULL,
  tags_json JSON NOT NULL DEFAULT ('[]'),
  sort_order INT NOT NULL DEFAULT 0,
  is_recommended TINYINT(1) NOT NULL DEFAULT 0,
  is_hot TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  review_reason VARCHAR(512) NOT NULL DEFAULT '',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  usage_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  favorite_count INT NOT NULL DEFAULT 0,
  content_check_status VARCHAR(32) NOT NULL DEFAULT 'not_checked',
  content_check_result JSON NULL,
  access_level VARCHAR(16) NOT NULL DEFAULT 'free',
  visibility_scope VARCHAR(16) NOT NULL DEFAULT 'all',
  usage_scope VARCHAR(16) NOT NULL DEFAULT 'all',
  required_member_plan_id BIGINT UNSIGNED NULL,
  member_badge_text VARCHAR(64) NOT NULL DEFAULT '',
  member_lock_message VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  INDEX idx_templates_public (is_enabled, visibility, status, review_status, deleted_at),
  INDEX idx_templates_feature (target_feature, template_type),
  INDEX idx_templates_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_tag_relations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  tag_name VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_template_tag (template_id, tag_name),
  INDEX idx_tag_name (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_review_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason VARCHAR(512) NOT NULL DEFAULT '',
  operator_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_template_review (template_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS file_export_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  export_file_no VARCHAR(32) NOT NULL DEFAULT '',
  export_storage_key VARCHAR(512) NOT NULL DEFAULT '',
  export_url VARCHAR(1024) NOT NULL DEFAULT '',
  metadata_sanitized TINYINT(1) NOT NULL DEFAULT 0,
  ai_implicit_label_kept TINYINT(1) NOT NULL DEFAULT 1,
  platform_watermark_removed TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  fail_reason VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_file_user (file_id, user_id),
  INDEX idx_export_file_no (export_file_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @metadata_sanitized_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'files' AND column_name = 'metadata_sanitized'
);
SET @sql := IF(@metadata_sanitized_exists = 0,
  'ALTER TABLE files ADD COLUMN metadata_sanitized TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''导出元数据已清理'' AFTER visibility',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ai_implicit_label_kept_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'files' AND column_name = 'ai_implicit_label_kept'
);
SET @sql := IF(@ai_implicit_label_kept_exists = 0,
  'ALTER TABLE files ADD COLUMN ai_implicit_label_kept TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''保留隐式AI生成标识'' AFTER metadata_sanitized',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @platform_watermark_removed_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'files' AND column_name = 'platform_watermark_removed'
);
SET @sql := IF(@platform_watermark_removed_exists = 0,
  'ALTER TABLE files ADD COLUMN platform_watermark_removed TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''去除平台水印'' AFTER ai_implicit_label_kept',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO app_configs (config_key, config_value, description, created_at, updated_at) VALUES
('compliance_tips', JSON_OBJECT(
  'ai_create', '请勿生成违法违规、侵权、涉政、涉黄、暴恐、侵犯肖像权或误导公众的内容。',
  'upload_reference', '请确认你拥有该图片的合法使用权；如包含他人肖像、商标、作品或隐私信息，请确保已获得授权。',
  'result', '本内容由 AI 生成或编辑，请合理使用，不得用于虚假宣传、冒充他人或误导公众。',
  'export_save', '保存或分享前，请确认该内容不侵犯他人合法权益，并遵守相关法律法规。',
  'public_template', '公开分享模板前，请确认你拥有公开展示和分享相关内容的合法权利。'
), '小程序合规轻提示文案', NOW(3), NOW(3)),
('membership.enabled', 'false', '会员功能总开关', NOW(3), NOW(3)),
('membership.show_entry', 'false', '会员入口展示开关', NOW(3), NOW(3)),
('inspiration.member_gate_enabled', 'false', '灵感会员准入开关', NOW(3), NOW(3)),
('template.member_gate_enabled', 'false', '模板会员准入开关', NOW(3), NOW(3)),
('template.user_share_enabled', 'true', '用户分享模板入口开关', NOW(3), NOW(3)),
('template.user_public_enabled', 'false', '用户模板公开展示开关', NOW(3), NOW(3)),
('template.require_manual_review', 'true', '用户模板人工审核开关', NOW(3), NOW(3)),
('template.require_content_check', 'true', '用户模板内容检测开关', NOW(3), NOW(3)),
('watermark_remove_enabled', 'true', '去除平台水印权益开关预留', NOW(3), NOW(3)),
('watermark_remove_required_plan', 'null', '去除平台水印所需套餐预留', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);
