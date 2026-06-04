CREATE TABLE IF NOT EXISTS release_update_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_from VARCHAR(64) NOT NULL DEFAULT '',
  version_to VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  backup_path VARCHAR(512) NOT NULL DEFAULT '',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  INDEX idx_version_to (version_to),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
