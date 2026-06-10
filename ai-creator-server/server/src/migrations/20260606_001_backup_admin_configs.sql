INSERT INTO system_configs
  (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('backup.enabled', 'true', 'boolean', 'backup', 0, '是否开启每天自动数据库备份', 10, NOW(3), NOW(3)),
  ('backup.dir', '', 'string', 'backup', 0, '数据库备份保存目录，留空使用安装目录 backups/db', 20, NOW(3), NOW(3)),
  ('backup.retention_days', '7', 'number', 'backup', 0, '自动备份保留天数', 30, NOW(3), NOW(3)),
  ('backup.auto_hour', '3', 'number', 'backup', 0, '每天自动备份执行小时，0 到 23', 40, NOW(3), NOW(3)),
  ('backup.timeout_seconds', '300', 'number', 'backup', 0, '单次 mysqldump 最长执行秒数', 50, NOW(3), NOW(3)),
  ('backup.email.enabled', 'false', 'boolean', 'backup', 0, '备份成功后是否发送邮件通知', 60, NOW(3), NOW(3)),
  ('backup.email.smtp_host', '', 'string', 'backup', 0, 'SMTP 服务器地址', 70, NOW(3), NOW(3)),
  ('backup.email.smtp_port', '465', 'number', 'backup', 0, 'SMTP 端口', 80, NOW(3), NOW(3)),
  ('backup.email.smtp_secure', 'true', 'boolean', 'backup', 0, 'SMTP 是否使用 SSL/TLS', 90, NOW(3), NOW(3)),
  ('backup.email.smtp_user', '', 'string', 'backup', 0, 'SMTP 登录账号', 100, NOW(3), NOW(3)),
  ('backup.email.smtp_pass', '', 'string', 'backup', 1, 'SMTP 密码或邮箱授权码', 110, NOW(3), NOW(3)),
  ('backup.email.from', '', 'string', 'backup', 0, '备份邮件发件人', 120, NOW(3), NOW(3)),
  ('backup.email.to', '', 'string', 'backup', 0, '备份邮件收件人，多个地址用英文逗号分隔', 130, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  config_group = VALUES(config_group),
  value_type = VALUES(value_type),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
