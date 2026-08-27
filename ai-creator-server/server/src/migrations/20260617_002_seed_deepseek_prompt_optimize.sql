-- Seed DeepSeek provider and prompt optimization text model.
-- No plaintext API key is stored here. Configure it in admin or through
-- DEEPSEEK_API_KEY / DEEPSEEK_TOKEN and provider-key sync.

SET @provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'deepseek' AND deleted_at IS NULL);

INSERT INTO ai_model_providers
  (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, auth_type, protocol_type, remark, status, created_at, updated_at)
SELECT 'DeepSeek', 'deepseek', 'openai_compatible', 'https://api.deepseek.com', '', 120, 2, 'bearer', 'rest',
       'DeepSeek OpenAI-compatible text provider. Configure API Key in admin or DEEPSEEK_API_KEY.',
       'active', NOW(3), NOW(3)
WHERE @provider_exists = 0;

UPDATE ai_model_providers
   SET name = 'DeepSeek',
       provider_type = 'openai_compatible',
       api_base_url = 'https://api.deepseek.com',
       auth_type = 'bearer',
       protocol_type = 'rest',
       default_timeout = GREATEST(COALESCE(default_timeout, 0), 120),
       default_retry = IF(default_retry IS NULL OR default_retry = 0, 2, default_retry),
       remark = 'DeepSeek OpenAI-compatible text provider. Configure API Key in admin or DEEPSEEK_API_KEY.',
       status = IF(status IS NULL OR status = '', 'active', status),
       updated_at = NOW(3)
 WHERE provider_key = 'deepseek' AND deleted_at IS NULL;

SET @deepseek_id := (SELECT id FROM ai_model_providers WHERE provider_key = 'deepseek' AND deleted_at IS NULL LIMIT 1);

UPDATE ai_models
   SET name = 'DeepSeekV4Flash',
       display_name = 'DeepSeek V4 Flash',
       model_type = 'text',
       sub_type = 'text_chat',
       api_model_name = 'deepseek-v4-flash',
       upstream_model_code = 'deepseek-v4-flash',
       is_async = 0,
       query_task_url = '',
       request_template = JSON_OBJECT(
         'response_format', JSON_OBJECT('type', 'json_object')
       ),
       result_path = '',
       status_mapping = JSON_OBJECT('completed', 'completed', 'failed', 'failed'),
       error_mapping = JSON_OBJECT(),
       timeout_seconds = 120,
       retry_times = 2,
       retry_delay_ms = 1000,
       daily_limit = 0,
       daily_limit_per_user = 0,
       max_concurrency = 5,
       priority = 0,
       points_cost = 0,
       api_cost_cents = 0,
       sort_order = 8800,
       config = JSON_OBJECT(
         'source', 'deepseek_openai_compatible',
         'source_checked_at', '2026-06-17',
         'api_format', 'openai_chat_completions',
         'capabilities', JSON_ARRAY('text_chat', 'text_generation', 'prompt_optimize'),
         'param_names', JSON_ARRAY('messages', 'temperature', 'max_tokens', 'response_format'),
         'default_params', JSON_OBJECT(
           'temperature', 0.4,
           'max_tokens', 1200,
           'response_format', JSON_OBJECT('type', 'json_object')
         ),
         'endpoints', JSON_OBJECT('chat', '/chat/completions')
       ),
       remark = 'Default DeepSeek model for mini-program prompt optimization.',
       status = 'active',
       updated_at = NOW(3)
 WHERE provider_id = @deepseek_id
   AND api_model_name = 'deepseek-v4-flash'
   AND deleted_at IS NULL;

INSERT INTO ai_models
  (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async,
   query_task_url, request_template, result_path, status_mapping, error_mapping,
   timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user,
   max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
SELECT @deepseek_id, 'DeepSeekV4Flash', 'DeepSeek V4 Flash', 'text', 'text_chat',
       'deepseek-v4-flash', 'deepseek-v4-flash', 0,
       '', JSON_OBJECT('response_format', JSON_OBJECT('type', 'json_object')), '',
       JSON_OBJECT('completed', 'completed', 'failed', 'failed'), JSON_OBJECT(),
       120, 2, 1000, 0, 0,
       5, 0, 0, 0, 8800,
       JSON_OBJECT(
         'source', 'deepseek_openai_compatible',
         'source_checked_at', '2026-06-17',
         'api_format', 'openai_chat_completions',
         'capabilities', JSON_ARRAY('text_chat', 'text_generation', 'prompt_optimize'),
         'param_names', JSON_ARRAY('messages', 'temperature', 'max_tokens', 'response_format'),
         'default_params', JSON_OBJECT(
           'temperature', 0.4,
           'max_tokens', 1200,
           'response_format', JSON_OBJECT('type', 'json_object')
         ),
         'endpoints', JSON_OBJECT('chat', '/chat/completions')
       ),
       'Default DeepSeek model for mini-program prompt optimization.',
       'active', NOW(3), NOW(3)
 WHERE @deepseek_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM ai_models
      WHERE provider_id = @deepseek_id
        AND api_model_name = 'deepseek-v4-flash'
        AND deleted_at IS NULL
   );

SET @deepseek_model_id := (
  SELECT m.id
    FROM ai_models m
    JOIN ai_model_providers p ON p.id = m.provider_id
   WHERE p.provider_key = 'deepseek'
     AND p.deleted_at IS NULL
     AND m.api_model_name = 'deepseek-v4-flash'
     AND m.deleted_at IS NULL
   LIMIT 1
);

INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('ai.prompt_optimize.enabled', 'true', 'boolean', 'ai', 0, 'Enable mini-program prompt optimization', 10, NOW(3), NOW(3)),
  ('ai.prompt_optimize.model_id', IFNULL(CAST(@deepseek_model_id AS CHAR), ''), 'string', 'ai', 0, 'Default text model ID for prompt optimization', 11, NOW(3), NOW(3)),
  ('ai.prompt_optimize.points_cost', '0', 'number', 'ai', 0, 'Prompt optimization points cost', 12, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  config_value = CASE
    WHEN config_key = 'ai.prompt_optimize.model_id' AND @deepseek_model_id IS NOT NULL THEN CAST(@deepseek_model_id AS CHAR)
    WHEN config_key = 'ai.prompt_optimize.enabled' THEN 'true'
    ELSE config_value
  END,
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
