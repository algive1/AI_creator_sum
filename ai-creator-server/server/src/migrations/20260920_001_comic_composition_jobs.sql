CREATE TABLE IF NOT EXISTS comic_composition_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_no VARCHAR(40) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  shots JSON NOT NULL,
  output_file_id BIGINT UNSIGNED NULL,
  output_url TEXT NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_comic_composition_job_no (job_no),
  INDEX idx_comic_composition_user_status (user_id, status, created_at),
  INDEX idx_comic_composition_project (project_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='漫剧成片合成任务';
