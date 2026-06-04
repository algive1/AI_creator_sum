SET @col_exists := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'model_tiers' AND column_name = 'quality_multipliers');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE model_tiers ADD COLUMN quality_multipliers JSON NULL COMMENT ''画质倍率定价{quality:multiplier}''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
