-- server/src/db/schema.sql
-- AI创作工坊 核心建表脚本 (Phase 1: 用户+积分)

CREATE DATABASE IF NOT EXISTS ai_creator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ai_creator;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NULL,
  unionid VARCHAR(64) NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(128) NULL,
  password_hash VARCHAR(255) NULL,
  nickname VARCHAR(64) NOT NULL DEFAULT '',
  avatar_url VARCHAR(512) NOT NULL DEFAULT '',
  account_type VARCHAR(32) NOT NULL DEFAULT 'wechat_miniprogram',
  status VARCHAR(16) NOT NULL DEFAULT 'normal',
  last_login_at DATETIME(3) NULL,
  last_login_ip VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE INDEX uk_openid (openid),
  UNIQUE INDEX uk_phone (phone),
  INDEX idx_unionid (unionid),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  real_name VARCHAR(32) NULL,
  gender TINYINT NOT NULL DEFAULT 0,
  birthday DATE NULL,
  province VARCHAR(32) NOT NULL DEFAULT '',
  city VARCHAR(32) NOT NULL DEFAULT '',
  invite_code VARCHAR(16) NOT NULL,
  invited_by_user_id BIGINT UNSIGNED NULL,
  preferences JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_user_id (user_id),
  UNIQUE INDEX uk_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  balance INT NOT NULL DEFAULT 0,
  total_earned INT NOT NULL DEFAULT 0,
  total_spent INT NOT NULL DEFAULT 0,
  total_refunded INT NOT NULL DEFAULT 0,
  frozen_balance INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(16) NOT NULL,
  amount INT NOT NULL,
  balance_before INT NOT NULL,
  balance_after INT NOT NULL,
  frozen_before INT NOT NULL DEFAULT 0,
  frozen_after INT NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL,
  ref_type VARCHAR(32) NULL,
  ref_id VARCHAR(64) NULL,
  title VARCHAR(64) NOT NULL DEFAULT '',
  remark VARCHAR(255) NOT NULL DEFAULT '',
  operator_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_source_ref (source, ref_type, ref_id),
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  points_balance INT NOT NULL DEFAULT 0,
  total_points_earned INT NOT NULL DEFAULT 0,
  total_points_spent INT NOT NULL DEFAULT 0,
  membership_level VARCHAR(16) NOT NULL DEFAULT 'free',
  membership_expire_at DATETIME(3) NULL,
  total_creations INT NOT NULL DEFAULT 0,
  total_favorites INT NOT NULL DEFAULT 0,
  coupons_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invite_relations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inviter_user_id BIGINT UNSIGNED NOT NULL,
  invitee_user_id BIGINT UNSIGNED NOT NULL,
  invite_code_used VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'registered',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_invitee (invitee_user_id),
  INDEX idx_inviter (inviter_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
