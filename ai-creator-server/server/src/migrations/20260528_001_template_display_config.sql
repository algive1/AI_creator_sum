SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'templates' AND column_name = 'display_config'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE templates ADD COLUMN display_config JSON NULL AFTER target_feature',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migrate existing target_feature values into display_config
UPDATE templates
   SET display_config = JSON_OBJECT(target_feature, JSON_OBJECT('pinned', IF(is_recommended = 1, true, false), 'pinOrder', IF(is_recommended = 1, sort_order, 0)))
 WHERE display_config IS NULL AND target_feature IS NOT NULL AND target_feature != '';
