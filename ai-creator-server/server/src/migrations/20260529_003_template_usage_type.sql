SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'templates' AND column_name = 'usage_type');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE templates ADD COLUMN usage_type VARCHAR(16) NOT NULL DEFAULT ''generate'' COMMENT ''generate=文生图/reference=图生图参考/edit=图片编辑''',
  'SELECT ''usage_type column already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE templates SET usage_type = 'edit' WHERE template_type = 'image' AND target_feature = 'image_edit' AND usage_type = 'generate';
