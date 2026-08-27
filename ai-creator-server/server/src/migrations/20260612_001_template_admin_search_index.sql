SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'templates' AND index_name = 'idx_templates_admin_list'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE templates ADD INDEX idx_templates_admin_list (source, template_type, deleted_at, sort_order, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
