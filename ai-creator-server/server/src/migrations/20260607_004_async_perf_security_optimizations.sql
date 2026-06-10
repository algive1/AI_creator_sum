SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND column_name = 'admin_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE admin_operation_logs ADD COLUMN admin_id BIGINT UNSIGNED NULL AFTER admin_user_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND column_name = 'table_name'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE admin_operation_logs ADD COLUMN table_name VARCHAR(64) NOT NULL DEFAULT '''' AFTER target_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND column_name = 'record_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE admin_operation_logs ADD COLUMN record_id VARCHAR(64) NOT NULL DEFAULT '''' AFTER target_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND column_name = 'before_data'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE admin_operation_logs ADD COLUMN before_data JSON NULL AFTER record_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND column_name = 'after_data'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE admin_operation_logs ADD COLUMN after_data JSON NULL AFTER before_data',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND column_name = 'ip'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE admin_operation_logs ADD COLUMN ip VARCHAR(64) NOT NULL DEFAULT '''' AFTER detail',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'admin_operation_logs' AND index_name = 'idx_admin_id_created'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE admin_operation_logs ADD INDEX idx_admin_id_created (admin_id, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_user_id_cursor'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_user_id_cursor (user_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_user_id_cursor'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_user_id_cursor (user_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
