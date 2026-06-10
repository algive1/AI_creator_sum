-- schema_phase5.sql
-- 会员套餐、权益与订单表

CREATE TABLE IF NOT EXISTS member_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  version_key VARCHAR(16) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_version_key (version_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  plan_key VARCHAR(32) NOT NULL,
  duration_type VARCHAR(16) NOT NULL,
  duration_days INT NOT NULL,
  price INT NOT NULL,
  original_price INT NOT NULL,
  tag VARCHAR(16) NOT NULL DEFAULT '',
  description TEXT NULL,
  highlight_features JSON NOT NULL DEFAULT ('[]'),
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_plan_key (plan_key),
  INDEX idx_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_plan_rights (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  right_key VARCHAR(32) NOT NULL,
  right_name VARCHAR(64) NOT NULL,
  right_value VARCHAR(128) NOT NULL,
  right_category VARCHAR(32) NOT NULL,
  icon_url VARCHAR(512) NOT NULL DEFAULT '',
  icon_file_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_plan_right (plan_id, right_key),
  INDEX idx_plan (plan_id),
  INDEX idx_icon_file (icon_file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_benefit_icons (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  icon_key VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  icon_url VARCHAR(512) NOT NULL,
  icon_file_id BIGINT UNSIGNED NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'seed',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_icon_key (icon_key),
  INDEX idx_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_plan_point_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  total_points INT NOT NULL DEFAULT 0,
  immediate_points INT NOT NULL DEFAULT 0,
  monthly_points INT NOT NULL DEFAULT 0,
  gift_points INT NOT NULL DEFAULT 0,
  grant_mode VARCHAR(16) NOT NULL DEFAULT 'immediate',
  points_expire_type VARCHAR(16) NOT NULL DEFAULT 'with_membership',
  points_expire_days INT NULL,
  points_discount_rate DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_plan_id (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_plan_feature_discounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  feature_key VARCHAR(64) NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_plan_feature (plan_id, feature_key),
  INDEX idx_plan (plan_id),
  INDEX idx_feature (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_memberships (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  level_before VARCHAR(16) NOT NULL DEFAULT 'free',
  level_after VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  started_at DATETIME(3) NOT NULL,
  expire_at DATETIME(3) NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'purchase',
  auto_renew TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_status_expire (user_id, status, expire_at),
  INDEX idx_user_status (user_id, status),
  INDEX idx_expire_at (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  order_type VARCHAR(16) NOT NULL DEFAULT 'membership',
  plan_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(128) NOT NULL,
  amount INT NOT NULL,
  paid_amount INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  wx_transaction_id VARCHAR(64) NULL,
  paid_at DATETIME(3) NULL,
  expire_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_order_no (order_no),
  INDEX idx_user_status_created (user_id, status, created_at),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO member_versions (name, version_key, description, sort_order) VALUES
('专业版', 'pro', '面向个人创作者和小商家', 1),
('商业版', 'business', '面向企业、团队和代运营', 2);

INSERT IGNORE INTO member_plans (version_id, name, plan_key, duration_type, duration_days, price, original_price, tag, sort_order) VALUES
((SELECT id FROM member_versions WHERE version_key = 'pro'), '专业版月卡', 'pro_month', 'month', 30, 2900, 3900, '', 1),
((SELECT id FROM member_versions WHERE version_key = 'pro'), '专业版季卡', 'pro_quarter', 'quarter', 90, 6900, 9900, '推荐', 2),
((SELECT id FROM member_versions WHERE version_key = 'pro'), '专业版年卡', 'pro_year', 'year', 365, 19900, 29900, '超值', 3),
((SELECT id FROM member_versions WHERE version_key = 'business'), '商业版月卡', 'biz_month', 'month', 30, 9900, 12900, '', 4),
((SELECT id FROM member_versions WHERE version_key = 'business'), '商业版季卡', 'biz_quarter', 'quarter', 90, 24900, 34900, '推荐', 5),
((SELECT id FROM member_versions WHERE version_key = 'business'), '商业版年卡', 'biz_year', 'year', 365, 79900, 129900, '超值', 6);
