SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_user_status_created'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_user_status_created (user_id, status, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_task_outputs' AND index_name = 'uk_task_output_index'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_task_outputs ADD UNIQUE INDEX uk_task_output_index (task_id, output_index)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'point_logs' AND index_name = 'idx_user_created'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE point_logs ADD INDEX idx_user_created (user_id, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_user_status_created'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_user_status_created (user_id, status, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user_memberships' AND index_name = 'idx_user_status_expire'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE user_memberships ADD INDEX idx_user_status_expire (user_id, status, expire_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS api_slow_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(255) NOT NULL,
  query_summary VARCHAR(1024) NOT NULL DEFAULT '',
  body_summary VARCHAR(1024) NOT NULL DEFAULT '',
  user_id BIGINT UNSIGNED NULL,
  admin_id BIGINT UNSIGNED NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  duration_ms INT NOT NULL,
  status_code SMALLINT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_created_at (created_at),
  INDEX idx_path_created (path, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
