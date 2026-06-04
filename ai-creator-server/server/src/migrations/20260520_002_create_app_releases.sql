CREATE TABLE IF NOT EXISTS app_releases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(64) NOT NULL,
  release_name VARCHAR(128) NOT NULL DEFAULT '',
  package_name VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'installed',
  installed_at DATETIME(3) NULL,
  note TEXT NULL,
  UNIQUE INDEX uk_version (version),
  INDEX idx_status (status),
  INDEX idx_installed_at (installed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
