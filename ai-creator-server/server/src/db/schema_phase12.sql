-- schema_phase12.sql
-- Public model features, tiers, tier capabilities and tier-model bindings.

CREATE TABLE IF NOT EXISTS model_features (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  feature_key VARCHAR(32) NOT NULL COMMENT 'image_create / video_create / comic_create / image_edit / video_edit',
  feature_name VARCHAR(64) NOT NULL COMMENT 'feature name',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_feature_key (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS model_tiers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  feature_id BIGINT UNSIGNED NOT NULL,
  tier_name VARCHAR(64) NOT NULL COMMENT 'frontend tier name',
  tier_key VARCHAR(32) NOT NULL COMMENT 'tier key',
  description VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'tier description',
  tag VARCHAR(16) NOT NULL DEFAULT '' COMMENT 'recommend/hot/hd',
  icon_file_id BIGINT UNSIGNED NULL COMMENT 'tier icon files.id',
  points_cost INT NOT NULL DEFAULT 1 COMMENT 'points cost',
  pricing_mode VARCHAR(32) NOT NULL DEFAULT 'fixed' COMMENT 'fixed / matrix / per_second_matrix / token_preauth',
  pricing_rules JSON NULL COMMENT 'dynamic platform points pricing rules',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_recommended TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_tier_key (tier_key),
  INDEX idx_feature (feature_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tier_model_bindings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tier_id BIGINT UNSIGNED NOT NULL,
  model_id BIGINT UNSIGNED NOT NULL COMMENT 'real model ai_models.id',
  binding_type VARCHAR(16) NOT NULL DEFAULT 'primary' COMMENT 'primary / fallback',
  fallback_order INT NOT NULL DEFAULT 0 COMMENT 'fallback model order',
  failover_on_error TINYINT(1) NOT NULL DEFAULT 1,
  failover_on_timeout TINYINT(1) NOT NULL DEFAULT 1,
  failover_on_rate_limit TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_tier (tier_id),
  UNIQUE INDEX uk_tier_model (tier_id, model_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tier_capabilities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tier_id BIGINT UNSIGNED NOT NULL,
  supported_ratios JSON NOT NULL DEFAULT ('[]') COMMENT 'supported ratios',
  supported_qualities JSON NOT NULL DEFAULT ('[]') COMMENT 'supported qualities',
  supported_styles JSON NOT NULL DEFAULT ('[]') COMMENT 'supported styles',
  supported_durations JSON NULL COMMENT 'supported video durations',
  supported_camera_moves JSON NULL COMMENT 'supported camera moves',
  supported_audio_modes JSON NULL COMMENT 'supported video audio modes',
  default_audio_mode VARCHAR(32) NOT NULL DEFAULT 'silent',
  supported_size_modes JSON NOT NULL DEFAULT ('["auto","ratio"]'),
  allow_custom_pixels TINYINT(1) NOT NULL DEFAULT 0,
  native_sizes JSON NOT NULL DEFAULT ('[]'),
  default_ratio VARCHAR(16) NOT NULL DEFAULT '1:1',
  max_width INT NOT NULL DEFAULT 2048,
  max_height INT NOT NULL DEFAULT 2048,
  min_width INT NOT NULL DEFAULT 64,
  min_height INT NOT NULL DEFAULT 64,
  max_total_pixels INT NOT NULL DEFAULT 4194304,
  max_aspect_ratio DECIMAL(8,4) NOT NULL DEFAULT 4.0000,
  allow_postprocess TINYINT(1) NOT NULL DEFAULT 1,
  postprocess_modes JSON NOT NULL DEFAULT ('["cover","contain","resize"]'),
  allow_upscale TINYINT(1) NOT NULL DEFAULT 0,
  max_images INT NOT NULL DEFAULT 1,
  max_reference_images INT NOT NULL DEFAULT 4,
  input_mode VARCHAR(32) NULL COMMENT 'video input mode override',
  reference_upload_mode VARCHAR(32) NULL COMMENT 'video upload mode override',
  min_reference_images INT NULL COMMENT 'minimum required reference assets',
  required_reference TINYINT(1) NULL COMMENT 'whether reference asset is required',
  max_duration_seconds INT NOT NULL DEFAULT 30,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_tier_id (tier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'max_reference_images'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN max_reference_images INT NOT NULL DEFAULT 4 AFTER max_images',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'input_mode'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN input_mode VARCHAR(32) NULL COMMENT ''video input mode override'' AFTER max_reference_images',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'reference_upload_mode'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN reference_upload_mode VARCHAR(32) NULL COMMENT ''video upload mode override'' AFTER input_mode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'min_reference_images'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN min_reference_images INT NULL COMMENT ''minimum required reference assets'' AFTER reference_upload_mode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'required_reference'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN required_reference TINYINT(1) NULL COMMENT ''whether reference asset is required'' AFTER min_reference_images',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'display_name'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN display_name VARCHAR(64) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'points_cost'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN points_cost INT NOT NULL DEFAULT 2',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'membership_only'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN membership_only TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'is_default'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'config'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN config JSON NOT NULL DEFAULT (''{}'')',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'icon_file_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN icon_file_id BIGINT UNSIGNED NULL',
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
  'ALTER TABLE ai_models ADD COLUMN description VARCHAR(512) NOT NULL DEFAULT ''''',
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
  'ALTER TABLE ai_models ADD COLUMN is_fallback TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'is_recommended'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN is_recommended TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'remark'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_models ADD COLUMN remark VARCHAR(255) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'supported_size_modes'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN supported_size_modes JSON NOT NULL DEFAULT (''["auto","ratio"]'')',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'allow_custom_pixels'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN allow_custom_pixels TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'native_sizes'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN native_sizes JSON NOT NULL DEFAULT (''[]'')',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'default_ratio'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN default_ratio VARCHAR(16) NOT NULL DEFAULT ''1:1''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'max_width'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN max_width INT NOT NULL DEFAULT 2048',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'max_height'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN max_height INT NOT NULL DEFAULT 2048',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'min_width'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN min_width INT NOT NULL DEFAULT 64',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'min_height'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN min_height INT NOT NULL DEFAULT 64',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'max_total_pixels'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN max_total_pixels INT NOT NULL DEFAULT 4194304',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'max_aspect_ratio'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN max_aspect_ratio DECIMAL(8,4) NOT NULL DEFAULT 4.0000',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'allow_postprocess'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN allow_postprocess TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'postprocess_modes'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN postprocess_modes JSON NOT NULL DEFAULT (''["cover","contain","resize"]'')',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'allow_upscale'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN allow_upscale TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'tier_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN tier_id BIGINT UNSIGNED NULL COMMENT ''tier id'' AFTER task_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'actual_model_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN actual_model_id BIGINT UNSIGNED NULL COMMENT ''actual successful model''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'provider_task_id'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN provider_task_id VARCHAR(128) NULL COMMENT ''provider task id''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'price_snapshot'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN price_snapshot JSON NULL COMMENT ''price snapshot''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'cost_snapshot'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN cost_snapshot JSON NULL COMMENT ''upstream cost snapshot''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'actual_points_cost'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE ai_tasks ADD COLUMN actual_points_cost INT NOT NULL DEFAULT 0 COMMENT ''actual points cost''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_tier_id'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_tier_id (tier_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_provider_task_id'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_provider_task_id (provider_task_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND index_name = 'idx_actual_model_id'
);
SET @sql := IF(@index_exists = 0,
  'ALTER TABLE ai_tasks ADD INDEX idx_actual_model_id (actual_model_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
