-- Web-only model display controls for ooa8.com PC user web.
-- These fields are intentionally separate from tier_name/sort_order/status so
-- mini program entry names and ordering stay unchanged.

SET @web_visible_exists := (
  SELECT COUNT(1)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'model_tiers'
     AND COLUMN_NAME = 'web_visible'
);

SET @sql := IF(
  @web_visible_exists = 0,
  'ALTER TABLE model_tiers ADD COLUMN web_visible TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @web_display_name_exists := (
  SELECT COUNT(1)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'model_tiers'
     AND COLUMN_NAME = 'web_display_name'
);

SET @sql := IF(
  @web_display_name_exists = 0,
  'ALTER TABLE model_tiers ADD COLUMN web_display_name VARCHAR(128) NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @web_sort_order_exists := (
  SELECT COUNT(1)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'model_tiers'
     AND COLUMN_NAME = 'web_sort_order'
);

SET @sql := IF(
  @web_sort_order_exists = 0,
  'ALTER TABLE model_tiers ADD COLUMN web_sort_order INT NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @web_sort_index_exists := (
  SELECT COUNT(1)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'model_tiers'
     AND INDEX_NAME = 'idx_model_tiers_web_display'
);

SET @sql := IF(
  @web_sort_index_exists = 0,
  'ALTER TABLE model_tiers ADD INDEX idx_model_tiers_web_display (feature_id, status, web_visible, web_sort_order, sort_order)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

