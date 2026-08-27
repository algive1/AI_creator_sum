CREATE TABLE IF NOT EXISTS template_favorite_notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  favorite_id BIGINT UNSIGNED NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_template_favorite_notification (owner_user_id, actor_user_id, template_id),
  KEY idx_template_favorite_notifications_owner_read (owner_user_id, read_at, created_at),
  KEY idx_template_favorite_notifications_template (template_id),
  CONSTRAINT fk_template_favorite_notifications_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_template_favorite_notifications_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_template_favorite_notifications_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_template_favorite_notifications_favorite FOREIGN KEY (favorite_id) REFERENCES template_favorites(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
