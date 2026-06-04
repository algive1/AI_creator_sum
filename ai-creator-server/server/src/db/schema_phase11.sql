-- schema_phase11.sql
-- Model display fields and legacy inspiration template compatibility.

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'icon_file_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN icon_file_id BIGINT UNSIGNED NULL COMMENT ''model icon file id''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'description'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN description VARCHAR(512) NOT NULL DEFAULT '''' COMMENT ''model description''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'is_fallback'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN is_fallback TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''fallback model''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND index_name = 'idx_icon_file'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_models ADD INDEX idx_icon_file (icon_file_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @inspiration_templates_exists := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates'
);
SET @inspiration_duration_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'duration'
);
SET @sql := IF(@inspiration_templates_exists > 0 AND @inspiration_duration_exists = 0,
  'ALTER TABLE inspiration_templates ADD COLUMN duration VARCHAR(8) NOT NULL DEFAULT '''' COMMENT ''legacy video template duration''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @inspiration_type_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND index_name = 'idx_template_type'
);
SET @sql := IF(@inspiration_templates_exists > 0 AND @inspiration_type_index_exists = 0,
  'ALTER TABLE inspiration_templates ADD INDEX idx_template_type (template_type)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
