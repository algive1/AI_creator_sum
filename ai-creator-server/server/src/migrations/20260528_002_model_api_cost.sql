SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'api_cost_cents'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN api_cost_cents INT NOT NULL DEFAULT 0 AFTER points_cost',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
