-- Membership version-level rights template.
-- Moves rights from per-plan to per-version with plan-level overrides.
-- Date: 2026-06-20

-- 1. Create version rights template table
CREATE TABLE IF NOT EXISTS member_version_rights (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_id BIGINT UNSIGNED NOT NULL,
  right_key VARCHAR(32) NOT NULL,
  right_name VARCHAR(64) NOT NULL,
  right_value VARCHAR(128) NOT NULL DEFAULT '',
  hint VARCHAR(128) NOT NULL DEFAULT '',
  right_category VARCHAR(32) NOT NULL DEFAULT 'general',
  icon_url VARCHAR(512) NOT NULL DEFAULT '',
  icon_file_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_version_right (version_id, right_key),
  INDEX idx_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure right_key collation matches member_plan_rights for JOINs (idempotent)
SET @vr_collation_ok := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_version_rights'
    AND COLUMN_NAME = 'right_key' AND COLLATION_NAME = 'utf8mb4_unicode_ci');
SET @sql := IF(@vr_collation_ok = 0,
  'ALTER TABLE member_version_rights MODIFY right_key VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Add enabled column to plan rights for per-plan toggles (idempotent)
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_plan_rights' AND COLUMN_NAME = 'enabled');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE member_plan_rights ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Migrate existing plan rights into version rights template (deduplicate by version + right_key)
INSERT IGNORE INTO member_version_rights (version_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order)
SELECT p.version_id, pr.right_key,
       ANY_VALUE(COALESCE(pr.right_name, pr.right_key)) AS right_name,
       ANY_VALUE(COALESCE(pr.right_value, '')) AS right_value,
       ANY_VALUE(COALESCE(pr.right_category, 'general')) AS right_category,
       ANY_VALUE(COALESCE(pr.icon_url, '')) AS icon_url,
       ANY_VALUE(pr.icon_file_id) AS icon_file_id,
       MIN(pr.sort_order) AS sort_order
  FROM member_plan_rights pr
  JOIN member_plans p ON p.id = pr.plan_id
 GROUP BY p.version_id, pr.right_key;

-- 4. Ensure every plan has a row for every version right (fill gaps)
INSERT IGNORE INTO member_plan_rights (plan_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order, enabled)
SELECT p.id, vr.right_key, vr.right_name, vr.right_value, vr.right_category, vr.icon_url, vr.icon_file_id, vr.sort_order, 1
  FROM member_plans p
  JOIN member_version_rights vr ON vr.version_id = p.version_id
 WHERE NOT EXISTS (
   SELECT 1 FROM member_plan_rights pr WHERE pr.plan_id = p.id AND pr.right_key COLLATE utf8mb4_unicode_ci = vr.right_key COLLATE utf8mb4_unicode_ci
 );
