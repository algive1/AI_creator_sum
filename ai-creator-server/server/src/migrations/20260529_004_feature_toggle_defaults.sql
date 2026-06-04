INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, created_at, updated_at) VALUES
('membership.enabled', 'true', 'boolean', 'general', 0, 'Membership system toggle', NOW(3), NOW(3)),
('ai.prompt_optimize.enabled', 'true', 'boolean', 'ai', 0, 'AI prompt optimization toggle', NOW(3), NOW(3)),
('ai.script_generate.enabled', 'true', 'boolean', 'ai', 0, 'AI script generation toggle', NOW(3), NOW(3)),
('ai.prompt_generate.enabled', 'true', 'boolean', 'ai', 0, 'AI prompt generation toggle', NOW(3), NOW(3)),
('ai.storyboard_generate.enabled', 'true', 'boolean', 'ai', 0, 'AI storyboard generation toggle', NOW(3), NOW(3)),
('template.user_share_enabled', 'true', 'boolean', 'general', 0, 'User template sharing toggle', NOW(3), NOW(3)),
('template.user_public_enabled', 'true', 'boolean', 'general', 0, 'Public user templates toggle', NOW(3), NOW(3)),
('template.member_gate_enabled', 'true', 'boolean', 'general', 0, 'Template member gate toggle', NOW(3), NOW(3)),
('inspiration.member_gate_enabled', 'true', 'boolean', 'general', 0, 'Inspiration member gate toggle', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE description = VALUES(description), value_type = VALUES(value_type);
