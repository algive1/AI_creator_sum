INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
VALUES
  ('ai.prompt_optimize.enabled', 'false', 'boolean', 'ai', 0, '是否启用提示词智能优化', 10, NOW(3), NOW(3)),
  ('ai.prompt_optimize.model_id', '', 'string', 'ai', 0, '智能优化默认文本模型 ID', 11, NOW(3), NOW(3)),
  ('ai.prompt_optimize.points_cost', '0', 'number', 'ai', 0, '每次智能优化消耗积分', 12, NOW(3), NOW(3)),
  ('ai.script_generate.enabled', 'false', 'boolean', 'ai', 0, '是否启用脚本生成', 20, NOW(3), NOW(3)),
  ('ai.script_generate.model_id', '', 'string', 'ai', 0, '脚本生成默认文本模型 ID', 21, NOW(3), NOW(3)),
  ('ai.script_generate.points_cost', '0', 'number', 'ai', 0, '每次脚本生成消耗积分', 22, NOW(3), NOW(3)),
  ('ai.prompt_generate.enabled', 'false', 'boolean', 'ai', 0, '是否启用提示词生成', 30, NOW(3), NOW(3)),
  ('ai.prompt_generate.model_id', '', 'string', 'ai', 0, '提示词生成默认文本模型 ID', 31, NOW(3), NOW(3)),
  ('ai.prompt_generate.points_cost', '0', 'number', 'ai', 0, '每次提示词生成消耗积分', 32, NOW(3), NOW(3)),
  ('ai.storyboard_generate.enabled', 'false', 'boolean', 'ai', 0, '是否启用 AI 漫剧分镜生成', 40, NOW(3), NOW(3)),
  ('ai.storyboard_generate.model_id', '', 'string', 'ai', 0, 'AI 漫剧分镜默认文本模型 ID', 41, NOW(3), NOW(3)),
  ('ai.storyboard_generate.points_cost', '0', 'number', 'ai', 0, '每次分镜生成消耗积分', 42, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  value_type = VALUES(value_type),
  config_group = VALUES(config_group),
  is_secret = VALUES(is_secret),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
