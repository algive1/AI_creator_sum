SET @signin_records_updated_at_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'signin_records' AND column_name = 'updated_at'
);
SET @sql := IF(@signin_records_updated_at_exists = 0,
  'ALTER TABLE signin_records ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
