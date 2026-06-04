SET @point_package_bonus_type_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'point_packages' AND column_name = 'first_purchase_bonus_type'
);
SET @sql := IF(@point_package_bonus_type_exists = 0,
  'ALTER TABLE point_packages ADD COLUMN first_purchase_bonus_type VARCHAR(16) NOT NULL DEFAULT ''none'' AFTER description',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @point_package_bonus_points_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'point_packages' AND column_name = 'first_purchase_bonus_points'
);
SET @sql := IF(@point_package_bonus_points_exists = 0,
  'ALTER TABLE point_packages ADD COLUMN first_purchase_bonus_points INT NOT NULL DEFAULT 0 AFTER first_purchase_bonus_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_base_points_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'base_points_amount'
);
SET @sql := IF(@order_base_points_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN base_points_amount INT NOT NULL DEFAULT 0 AFTER points_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_bonus_type_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'points_bonus_type'
);
SET @sql := IF(@order_bonus_type_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN points_bonus_type VARCHAR(16) NOT NULL DEFAULT ''none'' AFTER base_points_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_bonus_amount_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'points_bonus_amount'
);
SET @sql := IF(@order_bonus_amount_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN points_bonus_amount INT NOT NULL DEFAULT 0 AFTER points_bonus_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_bonus_applied_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'points_bonus_applied'
);
SET @sql := IF(@order_bonus_applied_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN points_bonus_applied TINYINT(1) NOT NULL DEFAULT 0 AFTER points_bonus_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE member_orders
   SET base_points_amount = points_amount
 WHERE order_type = 'points'
   AND base_points_amount = 0
   AND points_amount > 0;

SET @idx_points_first_purchase_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_points_first_purchase'
);
SET @sql := IF(@idx_points_first_purchase_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_points_first_purchase (user_id, order_type, grant_status, grant_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
