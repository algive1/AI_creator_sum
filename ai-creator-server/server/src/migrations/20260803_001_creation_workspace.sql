CREATE TABLE IF NOT EXISTS creation_projects (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  cover_asset_id BIGINT UNSIGNED NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  default_owner_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN user_id ELSE NULL END) STORED,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_creation_project_default_owner (default_owner_id),
  INDEX idx_creation_project_user_status (user_id, status, updated_at),
  INDEX idx_creation_project_cover (cover_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创作项目';

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_no VARCHAR(40) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NULL,
  source_task_id BIGINT UNSIGNED NULL,
  source_output_id BIGINT UNSIGNED NULL,
  media_type VARCHAR(16) NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  deleted_at DATETIME(3) NULL,
  cleanup_after DATETIME(3) NULL,
  metadata JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_media_asset_no (asset_no),
  UNIQUE INDEX uk_media_asset_source_output (source_output_id),
  INDEX idx_media_asset_user_status (user_id, status, created_at),
  INDEX idx_media_asset_project_status (project_id, status, created_at),
  INDEX idx_media_asset_file (file_id),
  INDEX idx_media_asset_source_task (source_task_id),
  INDEX idx_media_asset_cleanup (status, cleanup_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图片和视频媒体资产';

CREATE TABLE IF NOT EXISTS task_asset_inputs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  input_role VARCHAR(32) NOT NULL DEFAULT 'reference',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_task_asset_input (task_id, asset_id, input_role, sort_order),
  INDEX idx_task_asset_input_asset (asset_id, task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务输入资产追溯';

CREATE TABLE IF NOT EXISTS task_quotes (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  task_type VARCHAR(16) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  points_cost INT NOT NULL DEFAULT 0,
  quote_snapshot JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_task_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_quote_user_expiry (user_id, expires_at),
  INDEX idx_task_quote_consumed (consumed_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='短期任务报价';

SET @project_col_exists := (
  SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_tasks' AND COLUMN_NAME = 'project_id'
);
SET @sql := IF(@project_col_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER user_id, ADD INDEX idx_task_project_status (project_id, status, created_at)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @client_request_col_exists := (
  SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_tasks' AND COLUMN_NAME = 'client_request_id'
);
SET @sql := IF(@client_request_col_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN client_request_id VARCHAR(80) NULL AFTER task_no, ADD UNIQUE INDEX uk_task_user_client_request (user_id, client_request_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @source_task_col_exists := (
  SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_tasks' AND COLUMN_NAME = 'source_task_id'
);
SET @sql := IF(@source_task_col_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN source_task_id BIGINT UNSIGNED NULL AFTER project_id, ADD INDEX idx_task_source (source_task_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO creation_projects (user_id, name, is_default, status, created_at, updated_at)
SELECT u.id, '未归类项目', 1, 'active', NOW(3), NOW(3)
  FROM users u
  LEFT JOIN creation_projects p ON p.user_id = u.id AND p.is_default = 1
 WHERE p.id IS NULL;

UPDATE ai_tasks t
JOIN creation_projects p ON p.user_id = t.user_id AND p.is_default = 1
   SET t.project_id = p.id
 WHERE t.project_id IS NULL;

INSERT IGNORE INTO media_assets
  (asset_no, user_id, project_id, file_id, source_task_id, source_output_id, media_type, name, status, metadata, created_at, updated_at)
SELECT CONCAT('AST', LPAD(o.id, 17, '0')),
       t.user_id,
       t.project_id,
       f.id,
       t.id,
       o.id,
       CASE WHEN o.output_type = 'video' THEN 'video' ELSE 'image' END,
       COALESCE(NULLIF(o.output_name, ''), NULLIF(o.title, ''), CONCAT('生成结果 ', o.output_index + 1)),
       'active',
       COALESCE(o.metadata, JSON_OBJECT()),
       o.created_at,
       NOW(3)
  FROM ai_task_outputs o
  JOIN ai_tasks t ON t.id = o.task_id AND t.project_id IS NOT NULL
  LEFT JOIN files f
    ON (f.ref_type = 'task_output'
        AND f.ref_id COLLATE utf8mb4_unicode_ci = CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci)
    OR (f.storage_key = o.cos_key AND f.user_id = t.user_id AND f.is_deleted = 0)
 WHERE NOT EXISTS (SELECT 1 FROM media_assets a WHERE a.source_output_id = o.id);
