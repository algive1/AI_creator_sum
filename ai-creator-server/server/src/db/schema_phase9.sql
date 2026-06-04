-- schema_phase9.sql
-- System Configuration Center tables

CREATE TABLE IF NOT EXISTS system_configs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(128) NOT NULL COMMENT '配置键 e.g. wechat.app_id, storage.cos.secret_key',
  config_value TEXT NOT NULL COMMENT '配置值 (sensitive fields encrypted)',
  value_type VARCHAR(16) NOT NULL DEFAULT 'string' COMMENT 'string/number/boolean/json',
  config_group VARCHAR(32) NOT NULL DEFAULT 'general' COMMENT 'general/wechat/payment/storage/model/security/upload',
  is_secret TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'sensitive field, encrypted + masked display',
  masked_value VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'masked display e.g. AKID****abcd',
  description VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_config_key (config_key),
  INDEX idx_group (config_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='System configuration table';

CREATE TABLE IF NOT EXISTS config_change_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  config_group VARCHAR(32) NOT NULL,
  config_key VARCHAR(128) NOT NULL,
  action VARCHAR(16) NOT NULL DEFAULT 'update' COMMENT 'create/update/delete',
  old_value_masked VARCHAR(128) NOT NULL DEFAULT '',
  new_value_masked VARCHAR(128) NOT NULL DEFAULT '',
  ip_address VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_admin (admin_user_id, created_at),
  INDEX idx_group_key (config_group, config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Configuration change audit log';

-- Migrate existing app_configs to system_configs
INSERT IGNORE INTO system_configs (config_key, config_value, value_type, config_group, description, sort_order)
  SELECT config_key, JSON_UNQUOTE(JSON_EXTRACT(config_value, '$')), 'json', 'general', description, 0
  FROM app_configs WHERE config_key NOT IN (SELECT config_key FROM system_configs);
