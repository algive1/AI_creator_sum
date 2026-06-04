CREATE TABLE IF NOT EXISTS point_packages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  price_cents INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_name (name),
  INDEX idx_enabled_sort (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Point purchase packages';

CREATE TABLE IF NOT EXISTS payment_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'wechat_jsapi',
  event_type VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  message VARCHAR(255) NOT NULL DEFAULT '',
  wx_transaction_id VARCHAR(64) NOT NULL DEFAULT '',
  wx_trade_state VARCHAR(32) NOT NULL DEFAULT '',
  raw_summary TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_order_created (order_no, created_at),
  INDEX idx_channel_event (channel, event_type, created_at),
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Payment audit logs';

ALTER TABLE member_orders
  MODIFY COLUMN plan_id BIGINT UNSIGNED NULL DEFAULT NULL,
  MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'created';

SET @product_id_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'product_id'
);
SET @sql := IF(@product_id_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER order_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @product_name_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'product_name'
);
SET @sql := IF(@product_name_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN product_name VARCHAR(128) NOT NULL DEFAULT '''' AFTER product_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @amount_total_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'amount_total'
);
SET @sql := IF(@amount_total_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN amount_total INT NOT NULL DEFAULT 0 AFTER product_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @currency_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'currency'
);
SET @sql := IF(@currency_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT ''CNY'' AFTER amount_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @points_amount_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'points_amount'
);
SET @sql := IF(@points_amount_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN points_amount INT NOT NULL DEFAULT 0 AFTER currency',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @member_plan_id_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'member_plan_id'
);
SET @sql := IF(@member_plan_id_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN member_plan_id BIGINT UNSIGNED NULL AFTER points_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @member_duration_days_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'member_duration_days'
);
SET @sql := IF(@member_duration_days_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN member_duration_days INT NOT NULL DEFAULT 0 AFTER member_plan_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pay_status_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'pay_status'
);
SET @sql := IF(@pay_status_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN pay_status VARCHAR(16) NOT NULL DEFAULT ''unpaid'' AFTER status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pay_channel_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'pay_channel'
);
SET @sql := IF(@pay_channel_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN pay_channel VARCHAR(32) NOT NULL DEFAULT ''wechat_jsapi'' AFTER pay_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @wx_prepay_id_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'wx_prepay_id'
);
SET @sql := IF(@wx_prepay_id_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN wx_prepay_id VARCHAR(64) NULL AFTER pay_channel',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @wx_trade_state_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'wx_trade_state'
);
SET @sql := IF(@wx_trade_state_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN wx_trade_state VARCHAR(32) NOT NULL DEFAULT '''' AFTER wx_prepay_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @wx_payer_openid_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'wx_payer_openid'
);
SET @sql := IF(@wx_payer_openid_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN wx_payer_openid VARCHAR(64) NOT NULL DEFAULT '''' AFTER wx_trade_state',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @wx_appid_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'wx_appid'
);
SET @sql := IF(@wx_appid_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN wx_appid VARCHAR(64) NOT NULL DEFAULT '''' AFTER wx_payer_openid',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @wx_mchid_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'wx_mchid'
);
SET @sql := IF(@wx_mchid_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN wx_mchid VARCHAR(32) NOT NULL DEFAULT '''' AFTER wx_appid',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @grant_status_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'grant_status'
);
SET @sql := IF(@grant_status_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN grant_status VARCHAR(16) NOT NULL DEFAULT ''pending'' AFTER paid_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @grant_message_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'grant_message'
);
SET @sql := IF(@grant_message_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN grant_message VARCHAR(255) NOT NULL DEFAULT '''' AFTER grant_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @grant_at_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND column_name = 'grant_at'
);
SET @sql := IF(@grant_at_exists = 0,
  'ALTER TABLE member_orders ADD COLUMN grant_at DATETIME(3) NULL AFTER grant_message',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_order_user_status_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_order_user_status'
);
SET @sql := IF(@idx_order_user_status_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_order_user_status (user_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_order_pay_status_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_order_pay_status'
);
SET @sql := IF(@idx_order_pay_status_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_order_pay_status (pay_status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_order_expire_at_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_order_expire_at'
);
SET @sql := IF(@idx_order_expire_at_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_order_expire_at (expire_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_order_type_created_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_order_type_created'
);
SET @sql := IF(@idx_order_type_created_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_order_type_created (order_type, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_order_channel_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'member_orders' AND index_name = 'idx_order_channel'
);
SET @sql := IF(@idx_order_channel_exists = 0,
  'ALTER TABLE member_orders ADD INDEX idx_order_channel (pay_channel)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @uk_order_id_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user_memberships' AND index_name = 'uk_order_id'
);
SET @uk_order_id_duplicates := (
  SELECT COUNT(*) FROM (
    SELECT order_id FROM user_memberships WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*) > 1
  ) duplicated_order_ids
);
SET @sql := IF(@uk_order_id_exists = 0 AND @uk_order_id_duplicates = 0,
  'ALTER TABLE user_memberships ADD UNIQUE KEY uk_order_id (order_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO point_packages (name, points, price_cents, enabled, sort_order, created_at, updated_at) VALUES
('新手包', 100, 1000, 1, 1, NOW(3), NOW(3)),
('热门包', 600, 5000, 1, 2, NOW(3), NOW(3)),
('旗舰包', 1500, 12000, 1, 3, NOW(3), NOW(3));

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('wechat_pay.enabled', 'false', 'boolean', 'wechat_pay', 0, '是否启用微信支付。关闭后不能发起支付。', 10, NOW(3), NOW(3)),
  ('wechat_pay.appid', '', 'string', 'wechat_pay', 0, '小程序 AppID。', 11, NOW(3), NOW(3)),
  ('wechat_pay.mchid', '', 'string', 'wechat_pay', 0, '微信支付商户号 mchid。', 12, NOW(3), NOW(3)),
  ('wechat_pay.api_v3_key', '', 'string', 'wechat_pay', 1, 'APIv3 密钥，用于回调解密。', 13, NOW(3), NOW(3)),
  ('wechat_pay.private_key', '', 'string', 'wechat_pay', 1, '商户私钥，用于请求签名。', 14, NOW(3), NOW(3)),
  ('wechat_pay.merchant_serial_no', '', 'string', 'wechat_pay', 0, '商户证书序列号。', 15, NOW(3), NOW(3)),
  ('wechat_pay.notify_url', '/api/v1/payments/wechat/notify', 'string', 'wechat_pay', 0, '微信支付成功后的回调地址。', 16, NOW(3), NOW(3)),
  ('wechat_pay.platform_cert_serial_no', '', 'string', 'wechat_pay', 0, '微信支付平台证书序列号，可选。', 17, NOW(3), NOW(3)),
  ('wechat_pay.platform_cert', '', 'string', 'wechat_pay', 1, '微信支付平台证书，可选。', 18, NOW(3), NOW(3)),
  ('wechat_pay.env', 'production', 'string', 'wechat_pay', 0, '微信支付环境：production / sandbox。', 19, NOW(3), NOW(3)),
  ('wechat_pay.timeout_minutes', '30', 'number', 'wechat_pay', 0, '订单支付超时时间，单位分钟。', 20, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);



UPDATE member_orders mo
LEFT JOIN member_plans mp ON mp.id = mo.plan_id
SET
  mo.product_id = COALESCE(mo.product_id, mo.plan_id),
  mo.product_name = COALESCE(NULLIF(mo.product_name, ''), mo.subject, mp.name, ''),
  mo.amount_total = CASE WHEN mo.amount_total = 0 THEN mo.amount ELSE mo.amount_total END,
  mo.currency = COALESCE(NULLIF(mo.currency, ''), 'CNY'),
  mo.points_amount = COALESCE(mo.points_amount, 0),
  mo.member_plan_id = COALESCE(mo.member_plan_id, mo.plan_id),
  mo.member_duration_days = CASE
    WHEN mo.member_duration_days = 0 AND mp.duration_days IS NOT NULL THEN mp.duration_days
    ELSE mo.member_duration_days
  END,
  mo.pay_status = CASE
    WHEN mo.status = 'paid' THEN 'paid'
    WHEN mo.status IN ('cancelled', 'expired', 'closed', 'refunded') THEN 'closed'
    WHEN mo.status = 'failed' THEN 'failed'
    ELSE 'unpaid'
  END,
  mo.pay_channel = COALESCE(NULLIF(mo.pay_channel, ''), 'wechat_jsapi'),
  mo.wx_trade_state = CASE WHEN mo.status = 'paid' THEN 'SUCCESS' ELSE mo.wx_trade_state END,
  mo.grant_status = CASE
    WHEN mo.status = 'paid' THEN 'granted'
    WHEN mo.status = 'failed' THEN 'failed'
    WHEN mo.status IN ('cancelled', 'expired', 'closed', 'refunded') THEN 'closed'
    ELSE 'pending'
  END,
  mo.grant_at = CASE
    WHEN mo.status = 'paid' AND mo.grant_at IS NULL THEN mo.paid_at
    ELSE mo.grant_at
  END,
  mo.wx_appid = COALESCE(NULLIF(mo.wx_appid, ''), ''),
  mo.wx_mchid = COALESCE(NULLIF(mo.wx_mchid, ''), '');
