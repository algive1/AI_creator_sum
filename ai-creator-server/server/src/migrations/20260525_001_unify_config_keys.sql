INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.enabled', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay enabled', 10, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.enabled')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.enabled');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.appid', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay AppID', 11, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.wechat_appid', 'payment.appid')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.appid')
 LIMIT 1;

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.mchid', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay mchid', 12, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.mch_id', 'payment.mchid')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.mchid')
 LIMIT 1;

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.api_v3_key', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay API v3 key', 13, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.api_v3_key')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.api_v3_key');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.private_key', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay private key', 14, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.private_key')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.private_key');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.merchant_serial_no', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay merchant serial number', 15, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.merchant_serial_no', 'payment.serial_no')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.merchant_serial_no')
 LIMIT 1;

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'wechat_pay.notify_url', config_value, value_type, 'wechat_pay', is_secret, masked_value, 'Wechat Pay notify URL', 16, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key IN ('payment.notify_url')
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'wechat_pay.notify_url');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'storage.provider', config_value, value_type, 'storage', is_secret, masked_value, 'Storage provider', 10, NOW(3), NOW(3)
  FROM system_configs old
 WHERE old.config_key = 'storage.type'
   AND NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'storage.provider');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'storage.provider', 'local', 'string', 'storage', 0, '', 'Storage provider', 10, NOW(3), NOW(3)
 WHERE NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'storage.provider');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'storage.local.upload_dir', '/www/wwwroot/ai-creator/uploads', 'string', 'storage', 0, '', 'Local upload directory', 11, NOW(3), NOW(3)
 WHERE NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'storage.local.upload_dir');

INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, masked_value, description, sort_order, created_at, updated_at)
SELECT 'storage.local.base_url', '/static', 'string', 'storage', 0, '', 'Local storage public base URL', 12, NOW(3), NOW(3)
 WHERE NOT EXISTS (SELECT 1 FROM system_configs c WHERE c.config_key = 'storage.local.base_url');

DELETE FROM system_configs
 WHERE config_key IN (
   'payment.enabled',
   'payment.wechat_appid',
   'payment.appid',
   'payment.mch_id',
   'payment.mchid',
   'payment.api_v3_key',
   'payment.private_key',
   'payment.merchant_serial_no',
   'payment.serial_no',
   'payment.public_key',
   'payment.notify_url',
   'payment.order_timeout_minutes',
   'payment.verify_signature',
   'payment.refund_enabled',
   'storage.type'
 );
