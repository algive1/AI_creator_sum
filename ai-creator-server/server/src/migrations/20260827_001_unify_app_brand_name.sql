-- Keep persisted configuration aligned with the current public brand.
-- Only known legacy defaults are changed, so the migration is safe to rerun.
UPDATE system_configs
   SET config_value = 'AI艺术生成工坊', updated_at = NOW(3)
 WHERE config_key = 'site.name'
   AND config_value IN ('AI创作工坊', 'AI艺术工坊', 'AIGC生成艺术工坊');

UPDATE system_configs
   SET config_value = 'AI艺术生成工坊后台', updated_at = NOW(3)
 WHERE config_key = 'site.admin_title'
   AND config_value IN ('AI创作工坊', 'AI艺术工坊', 'AIGC生成艺术工坊');

UPDATE system_configs
   SET config_value = 'AI艺术生成工坊客服咨询', updated_at = NOW(3)
 WHERE config_key = 'customer_service.send_message_title'
   AND config_value = 'AI创作助手客服咨询';
