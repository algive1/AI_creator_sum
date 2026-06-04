CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  migration_key VARCHAR(128) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  success TINYINT(1) NOT NULL DEFAULT 1,
  error_message TEXT NULL,
  UNIQUE INDEX uk_migration_key (migration_key),
  INDEX idx_success (success),
  INDEX idx_executed_at (executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
