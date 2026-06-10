-- 修复：user_invites.uk_invite_code 被错误地设为 UNIQUE 索引。
-- invite_code 是邀请人的邀请码，应该可以被多个被邀请人使用。
-- 改为普通 INDEX，保留索引名和性能特性，只去掉唯一约束。

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user_invites' AND index_name = 'uk_invite_code'
);
SET @idx_non_unique := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user_invites' AND index_name = 'uk_invite_code' AND non_unique = 1
);
SET @sql := IF(@idx_exists > 0 AND @idx_non_unique = 0,
  'ALTER TABLE user_invites DROP INDEX uk_invite_code',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user_invites' AND index_name = 'uk_invite_code'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE user_invites ADD INDEX uk_invite_code (invite_code)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
