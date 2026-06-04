SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'templates' AND column_name = 'content_check_status'
);
SET @sql := IF(@col_exists > 0,
  'ALTER TABLE templates DROP COLUMN content_check_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
