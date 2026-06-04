SET @failed_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'failed_at'
);

SET @sql := IF(
  @failed_at_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN failed_at DATETIME(3) NULL COMMENT ''任务失败时间'' AFTER completed_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @canceled_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'canceled_at'
);

SET @sql := IF(
  @canceled_at_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN canceled_at DATETIME(3) NULL COMMENT ''任务取消时间'' AFTER failed_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
