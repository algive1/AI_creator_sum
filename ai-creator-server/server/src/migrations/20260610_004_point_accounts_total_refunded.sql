SET @point_accounts_total_refunded_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'point_accounts' AND column_name = 'total_refunded'
);
SET @sql := IF(@point_accounts_total_refunded_exists = 0,
  'ALTER TABLE point_accounts ADD COLUMN total_refunded INT NOT NULL DEFAULT 0 AFTER total_spent',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
