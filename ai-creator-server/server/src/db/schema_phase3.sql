
CREATE TABLE IF NOT EXISTS ai_model_providers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  provider_key VARCHAR(32) NOT NULL,
  provider_type VARCHAR(16) NOT NULL DEFAULT 'custom',
  api_base_url VARCHAR(255) NOT NULL,
  api_key VARCHAR(512) NOT NULL,
  api_secret VARCHAR(512) NULL,
  default_timeout INT NOT NULL DEFAULT 120,
  default_retry TINYINT NOT NULL DEFAULT 3,
  config JSON NOT NULL DEFAULT ('{}'),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  last_health_check DATETIME(3) NULL,
  health_status VARCHAR(16) NOT NULL DEFAULT 'unknown',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE INDEX uk_provider_key (provider_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_models (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  model_type VARCHAR(16) NOT NULL,
  sub_type VARCHAR(32) NOT NULL DEFAULT '',
  api_model_name VARCHAR(64) NOT NULL,
  points_cost INT NOT NULL DEFAULT 2,
  priority INT NOT NULL DEFAULT 0,
  max_concurrency INT NOT NULL DEFAULT 5,
  membership_only TINYINT(1) NOT NULL DEFAULT 0,
  fallback_model_id BIGINT UNSIGNED NULL,
  retry_times TINYINT NOT NULL DEFAULT 3,
  retry_delay_ms INT NOT NULL DEFAULT 1000,
  timeout_seconds INT NOT NULL DEFAULT 120,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  config JSON NOT NULL DEFAULT ('{}'),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  INDEX idx_provider_id (provider_id),
  INDEX idx_model_type (model_type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  task_type VARCHAR(16) NOT NULL,
  sub_type VARCHAR(32) NULL,
  model_id BIGINT UNSIGNED NULL,
  title VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 0,
  points_cost INT NOT NULL DEFAULT 0,
  points_refunded INT NOT NULL DEFAULT 0,
  audit_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  audit_reason VARCHAR(255) NULL,
  fail_reason VARCHAR(255) NULL,
  current_step VARCHAR(32) NULL,
  retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_retries TINYINT UNSIGNED NOT NULL DEFAULT 3,
  queued_at DATETIME(3) NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  failed_at DATETIME(3) NULL,
  canceled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_task_no (task_no),
  INDEX idx_user_type_status (user_id, task_type, status),
  INDEX idx_type_status (task_type, status, created_at),
  INDEX idx_status_created (status, created_at),
  INDEX idx_model_id (model_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_task_inputs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  prompt TEXT NOT NULL,
  optimized_prompt TEXT NULL,
  system_prompt VARCHAR(1024) NOT NULL DEFAULT '',
  negative_prompt VARCHAR(1024) NOT NULL DEFAULT '',
  form_data JSON NOT NULL DEFAULT ('{}'),
  params JSON NOT NULL DEFAULT ('{}'),
  edit_tool VARCHAR(32) NULL,
  template_id BIGINT UNSIGNED NULL,
  source_task_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_task_outputs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  output_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
  output_name VARCHAR(32) NOT NULL DEFAULT '',
  title VARCHAR(128) NOT NULL DEFAULT '',
  subtitle VARCHAR(128) NOT NULL DEFAULT '',
  output_type VARCHAR(16) NOT NULL DEFAULT 'image',
  cos_key VARCHAR(512) NULL,
  thumbnail_key VARCHAR(512) NULL,
  ratio VARCHAR(8) NOT NULL DEFAULT '',
  style VARCHAR(16) NOT NULL DEFAULT '',
  width INT NOT NULL DEFAULT 0,
  height INT NOT NULL DEFAULT 0,
  file_size INT NOT NULL DEFAULT 0,
  prompt_used TEXT NULL,
  metadata JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_task_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  event VARCHAR(32) NOT NULL,
  message VARCHAR(512) NOT NULL DEFAULT '',
  detail JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_id (task_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_model_call_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  model_id BIGINT UNSIGNED NOT NULL,
  provider_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  call_type VARCHAR(16) NOT NULL DEFAULT 'primary',
  attempt_number TINYINT NOT NULL DEFAULT 1,
  request_body JSON NULL,
  response_body MEDIUMTEXT NULL,
  status_code SMALLINT NULL,
  is_success TINYINT(1) NOT NULL DEFAULT 0,
  error_type VARCHAR(64) NULL,
  error_message VARCHAR(1024) NULL,
  latency_ms INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_id (task_id),
  INDEX idx_model_created (model_id, created_at),
  INDEX idx_success (is_success),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_task_cost_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  model_id BIGINT UNSIGNED NOT NULL,
  provider_id BIGINT UNSIGNED NOT NULL,
  call_log_id BIGINT UNSIGNED NOT NULL,
  user_points_cost INT NOT NULL DEFAULT 0,
  api_cost_cents INT NOT NULL DEFAULT 0,
  api_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  api_raw_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  gross_profit_cents INT NOT NULL DEFAULT 0,
  image_count TINYINT NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_id (task_id),
  INDEX idx_model_id (model_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_configs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(64) NOT NULL,
  config_value JSON NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
