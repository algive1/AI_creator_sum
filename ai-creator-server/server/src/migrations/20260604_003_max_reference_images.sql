SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'max_reference_images'
);
SET @sql := IF(@col = 0, 'ALTER TABLE tier_capabilities ADD COLUMN max_reference_images INT NOT NULL DEFAULT 4 AFTER max_images', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE tier_capabilities
   SET max_reference_images = 4
 WHERE max_reference_images IS NULL OR max_reference_images < 1;
