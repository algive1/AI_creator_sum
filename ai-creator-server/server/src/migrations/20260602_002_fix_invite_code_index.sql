-- 修复：user_invites.uk_invite_code 被错误地设为 UNIQUE 索引。
-- invite_code 是邀请人的邀请码，应该可以被多个被邀请人使用。
-- 改为普通 INDEX，保留索引名和性能特性，只去掉唯一约束。

ALTER TABLE user_invites
  DROP INDEX uk_invite_code,
  ADD INDEX uk_invite_code (invite_code);
