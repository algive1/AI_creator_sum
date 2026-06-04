CREATE TABLE IF NOT EXISTS config_check_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  target_key VARCHAR(128) NOT NULL COMMENT '配置检查对象，例如 wechat-miniapp、storage、ai-model:image:1',
  target_type VARCHAR(32) NOT NULL DEFAULT 'config' COMMENT 'config/storage/ai_model/business/system',
  last_test_status VARCHAR(32) NOT NULL DEFAULT 'untested' COMMENT 'untested/passed/failed/risk/manual_verified',
  last_test_at DATETIME(3) NULL,
  last_test_message VARCHAR(512) NOT NULL DEFAULT '',
  last_test_operator BIGINT UNSIGNED NULL,
  last_test_warnings JSON NULL,
  last_test_errors JSON NULL,
  manual_verified TINYINT(1) NOT NULL DEFAULT 0,
  manual_verified_at DATETIME(3) NULL,
  manual_verified_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_target_key (target_key),
  INDEX idx_target_type (target_type),
  INDEX idx_last_status (last_test_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='上线配置检查与测试状态';
