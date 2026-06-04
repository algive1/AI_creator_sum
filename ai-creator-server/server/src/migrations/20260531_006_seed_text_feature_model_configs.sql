INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('ai.prompt_optimize.model_id', '', 'string', 'ai', 0, '智能优化默认文本模型 ID', 11, NOW(3), NOW(3)),
  ('ai.script_generate.model_id', '', 'string', 'ai', 0, '脚本生成默认文本模型 ID', 21, NOW(3), NOW(3)),
  ('ai.prompt_generate.model_id', '', 'string', 'ai', 0, '提示词生成默认文本模型 ID', 31, NOW(3), NOW(3)),
  ('ai.storyboard_generate.model_id', '', 'string', 'ai', 0, 'AI 漫剧分镜默认文本模型 ID', 41, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);

UPDATE system_configs c
JOIN (
  SELECT m.id
    FROM ai_models m
    JOIN ai_model_providers p ON p.id = m.provider_id
   WHERE p.provider_key = 'xiaoma'
     AND p.deleted_at IS NULL
     AND m.name = 'gpt-5.2-chat-latest'
     AND m.model_type = 'text'
     AND m.status = 'active'
   LIMIT 1
) text_model ON 1 = 1
SET c.config_value = CAST(text_model.id AS CHAR),
    c.updated_at = NOW(3)
WHERE c.config_key IN (
  'ai.prompt_optimize.model_id',
  'ai.script_generate.model_id',
  'ai.prompt_generate.model_id',
  'ai.storyboard_generate.model_id'
)
  AND (c.config_value IS NULL OR c.config_value = '' OR c.config_value = '0');
