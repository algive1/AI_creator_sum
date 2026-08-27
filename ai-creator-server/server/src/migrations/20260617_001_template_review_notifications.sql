CREATE TABLE IF NOT EXISTS template_review_notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'approved',
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_template_review_notification (user_id, template_id, review_status),
  KEY idx_template_review_notifications_user_read (user_id, read_at, created_at),
  KEY idx_template_review_notifications_template (template_id),
  CONSTRAINT fk_template_review_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_template_review_notifications_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
