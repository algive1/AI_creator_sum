-- schema_phase10.sql
-- AI model capabilities, pricing, and fallback rules

CREATE TABLE IF NOT EXISTS ai_model_capabilities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id BIGINT UNSIGNED NOT NULL,
  capability_key VARCHAR(64) NOT NULL COMMENT 'text_to_image, image_to_video, upscale, music_video, etc.',
  is_supported TINYINT(1) NOT NULL DEFAULT 1,
  config JSON NOT NULL DEFAULT (JSON_OBJECT()) COMMENT 'supported_ratios, durations, resolutions, max_images',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_model_cap (model_id, capability_key),
  INDEX idx_capability (capability_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_model_price_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id BIGINT UNSIGNED NOT NULL,
  rule_name VARCHAR(64) NOT NULL DEFAULT '',
  base_points INT NOT NULL DEFAULT 1,
  duration_surcharge JSON NOT NULL DEFAULT (JSON_OBJECT()),
  resolution_surcharge JSON NOT NULL DEFAULT (JSON_OBJECT()),
  image_count_surcharge JSON NOT NULL DEFAULT (JSON_OBJECT()),
  free_points INT NOT NULL DEFAULT 2,
  monthly_points INT NOT NULL DEFAULT 2,
  yearly_points INT NOT NULL DEFAULT 1,
  business_monthly_points INT NOT NULL DEFAULT 1,
  business_yearly_points INT NOT NULL DEFAULT 1,
  api_cost_cents INT NOT NULL DEFAULT 0,
  api_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_model (model_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_model_fallback_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id BIGINT UNSIGNED NOT NULL,
  fallback_model_id BIGINT UNSIGNED NOT NULL,
  trigger_on_error TINYINT(1) NOT NULL DEFAULT 1,
  trigger_on_timeout TINYINT(1) NOT NULL DEFAULT 1,
  trigger_on_rate_limit TINYINT(1) NOT NULL DEFAULT 1,
  trigger_on_content_filter TINYINT(1) NOT NULL DEFAULT 0 COMMENT '预留字段：模型因内容审核拒绝时自动切换备用模型，接入OpenAI等境外模型后启用',
  keep_original_price TINYINT(1) NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_model_fallback (model_id, fallback_model_id),
  INDEX idx_model (model_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
