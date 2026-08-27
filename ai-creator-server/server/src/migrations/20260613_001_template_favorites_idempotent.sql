CREATE TABLE IF NOT EXISTS template_favorites (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_template_favorite_user_template (user_id, template_id),
  KEY idx_template_favorites_template_id (template_id),
  CONSTRAINT fk_template_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_template_favorites_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @idx_template_favorites_template_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'template_favorites'
    AND index_name = 'idx_template_favorites_template_id'
);
SET @idx_template_favorites_template_id_sql := IF(
  @idx_template_favorites_template_id_exists = 0,
  'CREATE INDEX idx_template_favorites_template_id ON template_favorites (template_id)',
  'SELECT 1'
);
PREPARE idx_template_favorites_template_id_stmt FROM @idx_template_favorites_template_id_sql;
EXECUTE idx_template_favorites_template_id_stmt;
DEALLOCATE PREPARE idx_template_favorites_template_id_stmt;
