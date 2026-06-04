-- server/src/db/schema_phase8.sql
-- Phase 8: provider/model/task extension columns.

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_model_providers' AND column_name = 'protocol_type'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_model_providers ADD COLUMN protocol_type VARCHAR(16) NOT NULL DEFAULT ''rest'' COMMENT ''rest/graphql/grpc''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_model_providers' AND column_name = 'auth_type'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_model_providers ADD COLUMN auth_type VARCHAR(16) NOT NULL DEFAULT ''bearer'' COMMENT ''bearer/api_key/basic/signature''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_model_providers' AND column_name = 'remark'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_model_providers ADD COLUMN remark VARCHAR(255) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'upstream_model_code'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN upstream_model_code VARCHAR(64) NOT NULL DEFAULT '''' COMMENT ''upstream model code''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'is_async'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN is_async TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''async task model''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'query_task_url'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN query_task_url VARCHAR(512) NOT NULL DEFAULT '''' COMMENT ''async query URL''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'status_mapping'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN status_mapping JSON NOT NULL DEFAULT (''{}'') COMMENT ''status mapping''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'error_mapping'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN error_mapping JSON NOT NULL DEFAULT (''{}'') COMMENT ''error mapping''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'result_path'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN result_path VARCHAR(128) NOT NULL DEFAULT '''' COMMENT ''result JSON path''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'request_template'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN request_template JSON NOT NULL DEFAULT (''{}'') COMMENT ''request body template''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'sort_order'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT ''sort weight''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'is_recommended'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN is_recommended TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''recommended model''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'daily_limit'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN daily_limit INT NOT NULL DEFAULT 0 COMMENT ''daily call limit''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'daily_limit_per_user'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN daily_limit_per_user INT NOT NULL DEFAULT 0 COMMENT ''per-user daily call limit''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'actual_model_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN actual_model_id BIGINT UNSIGNED NULL COMMENT ''actual execution model''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'provider_task_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN provider_task_id VARCHAR(128) NULL COMMENT ''provider task id''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'price_snapshot'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN price_snapshot JSON NULL COMMENT ''price snapshot''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'cost_snapshot'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN cost_snapshot JSON NULL COMMENT ''upstream cost snapshot''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'actual_points_cost'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN actual_points_cost INT NOT NULL DEFAULT 0 COMMENT ''actual points cost''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_provider_task_id'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_provider_task_id (provider_task_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_actual_model_id'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_actual_model_id (actual_model_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
