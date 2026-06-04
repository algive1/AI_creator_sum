SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'point_packages' AND column_name = 'bonus_points'
);
SET @sql := IF(@col_exists > 0,
  'ALTER TABLE point_packages DROP COLUMN bonus_points',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
