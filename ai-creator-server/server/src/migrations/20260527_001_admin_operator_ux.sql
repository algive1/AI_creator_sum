SET @point_package_description_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'point_packages' AND column_name = 'description'
);
SET @sql := IF(@point_package_description_exists = 0,
  'ALTER TABLE point_packages ADD COLUMN description VARCHAR(20) NOT NULL DEFAULT '''' AFTER price_cents',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE point_packages SET description = '适合体验' WHERE name = '新手包' AND description = '';
UPDATE point_packages SET description = '热门选择' WHERE name = '热门包' AND description = '';
UPDATE point_packages SET description = '大量创作' WHERE name = '旗舰包' AND description = '';

SET @provider_type_width := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_model_providers' AND column_name = 'provider_type'
);
SET @sql := IF(@provider_type_width IS NOT NULL AND @provider_type_width < 32,
  'ALTER TABLE ai_model_providers MODIFY COLUMN provider_type VARCHAR(32) NOT NULL DEFAULT ''custom''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
