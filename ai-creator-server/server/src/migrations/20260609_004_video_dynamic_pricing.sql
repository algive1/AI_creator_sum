-- Add dynamic pricing configuration for public model tiers.
-- This keeps points_cost as the default/fallback price and lets video tiers
-- define parameter-based platform point pricing without changing old tiers.

SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'model_tiers'
     AND column_name = 'pricing_mode'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE model_tiers ADD COLUMN pricing_mode VARCHAR(32) NOT NULL DEFAULT ''fixed'' AFTER points_cost',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'model_tiers'
     AND column_name = 'pricing_rules'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE model_tiers ADD COLUMN pricing_rules JSON NULL AFTER pricing_mode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
