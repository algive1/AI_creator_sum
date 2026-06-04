SET @provider_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'provider_status'
);
SET @sql := IF(
  @provider_status_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN provider_status VARCHAR(64) NULL COMMENT ''供应商原始状态'' AFTER provider_task_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @provider_status_message_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'provider_status_message'
);
SET @sql := IF(
  @provider_status_message_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN provider_status_message TEXT NULL COMMENT ''供应商状态说明或错误摘要'' AFTER provider_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @provider_started_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'provider_started_at'
);
SET @sql := IF(
  @provider_started_at_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN provider_started_at DATETIME(3) NULL COMMENT ''提交供应商时间'' AFTER provider_status_message',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @next_poll_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'next_poll_at'
);
SET @sql := IF(
  @next_poll_at_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN next_poll_at DATETIME(3) NULL COMMENT ''下次查询供应商时间'' AFTER provider_started_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @poll_count_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'poll_count'
);
SET @sql := IF(
  @poll_count_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN poll_count INT NOT NULL DEFAULT 0 COMMENT ''供应商查询次数'' AFTER next_poll_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @last_polled_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'last_polled_at'
);
SET @sql := IF(
  @last_polled_at_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN last_polled_at DATETIME(3) NULL COMMENT ''最近一次查询供应商时间'' AFTER poll_count',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @video_mode_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'video_mode'
);
SET @sql := IF(
  @video_mode_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN video_mode VARCHAR(64) NULL COMMENT ''视频模式'' AFTER last_polled_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @video_duration_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'video_duration'
);
SET @sql := IF(
  @video_duration_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN video_duration INT NULL COMMENT ''视频时长秒数'' AFTER video_mode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @video_ratio_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'video_ratio'
);
SET @sql := IF(
  @video_ratio_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN video_ratio VARCHAR(32) NULL COMMENT ''视频比例'' AFTER video_duration',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @processing_lock_until_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND column_name = 'processing_lock_until'
);
SET @sql := IF(
  @processing_lock_until_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN processing_lock_until DATETIME(3) NULL COMMENT ''异步轮询处理锁过期时间'' AFTER video_ratio',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_video_poll_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_tasks'
    AND index_name = 'idx_video_poll'
);
SET @sql := IF(
  @idx_video_poll_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_video_poll (task_type, status, next_poll_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
