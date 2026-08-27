-- Add web email account uniqueness for ooa8.com users.
-- MySQL allows multiple NULL values in a unique index, so existing WeChat users are unaffected.

SET @email_index_exists := (
  SELECT COUNT(1)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'users'
     AND INDEX_NAME = 'uk_email'
);

SET @sql := IF(
  @email_index_exists = 0,
  'ALTER TABLE users ADD UNIQUE INDEX uk_email (email)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
