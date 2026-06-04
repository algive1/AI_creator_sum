CREATE TABLE IF NOT EXISTS user_invites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inviter_user_id BIGINT UNSIGNED NOT NULL,
  invitee_user_id BIGINT UNSIGNED NOT NULL,
  invite_code VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'valid',
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  bound_at DATETIME(3) NULL,
  invalid_reason VARCHAR(255) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_invitee (invitee_user_id),
  UNIQUE INDEX uk_inviter_invitee (inviter_user_id, invitee_user_id),
  UNIQUE INDEX uk_invite_code (invite_code),
  INDEX idx_inviter_created (inviter_user_id, created_at),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Invite relation records';

CREATE TABLE IF NOT EXISTS invite_reward_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invite_id BIGINT UNSIGNED NULL,
  inviter_user_id BIGINT UNSIGNED NOT NULL,
  invitee_user_id BIGINT UNSIGNED NOT NULL,
  reward_type VARCHAR(32) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'granted',
  reason VARCHAR(255) NOT NULL DEFAULT '',
  related_order_id VARCHAR(64) NOT NULL DEFAULT '',
  point_log_id BIGINT UNSIGNED NULL,
  granted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_reward (inviter_user_id, invitee_user_id, reward_type),
  INDEX idx_inviter_created (inviter_user_id, created_at),
  INDEX idx_invitee_created (invitee_user_id, created_at),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Invite reward logs';

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('invite.enabled', 'false', 'boolean', 'invite', 0, '是否开启邀请功能。关闭后，小程序不展示邀请入口，也不会发放邀请奖励。', 10, NOW(3), NOW(3)),
  ('invite.reward_on_use_enabled', 'true', 'boolean', 'invite', 0, '好友首次进入并绑定邀请码后，是否给邀请人发放积分。', 11, NOW(3), NOW(3)),
  ('invite.reward_on_use_points', '20', 'number', 'invite', 0, '好友首次进入并绑定邀请码后，给邀请人发放多少积分。', 12, NOW(3), NOW(3)),
  ('invite.reward_on_member_enabled', 'true', 'boolean', 'invite', 0, '好友真实支付开通会员后，是否给邀请人发放积分。', 13, NOW(3), NOW(3)),
  ('invite.reward_on_member_points', '100', 'number', 'invite', 0, '好友真实支付开通会员后，给邀请人发放多少积分。', 14, NOW(3), NOW(3)),
  ('invite.max_reward_per_day', '20', 'number', 'invite', 0, '限制邀请人每天最多获得几次邀请积分，防止重复刷积分。', 15, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);

INSERT IGNORE INTO user_invites
  (inviter_user_id, invitee_user_id, invite_code, status, source, created_at, bound_at, invalid_reason, updated_at)
SELECT
  ir.inviter_user_id,
  ir.invitee_user_id,
  ir.invite_code_used,
  CASE WHEN ir.status = 'invalid' THEN 'invalid' ELSE 'valid' END,
  'manual',
  ir.created_at,
  ir.created_at,
  '',
  ir.created_at
FROM invite_relations ir
WHERE ir.invitee_user_id IS NOT NULL
  AND ir.invite_code_used IS NOT NULL
  AND ir.invite_code_used <> '';

UPDATE user_profiles up
JOIN invite_relations ir ON ir.invitee_user_id = up.user_id
SET up.invited_by_user_id = ir.inviter_user_id
WHERE up.invited_by_user_id IS NULL;
