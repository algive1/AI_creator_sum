INSERT IGNORE INTO ai_model_providers (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status) VALUES
('OpenAI', 'openai', 'openai', 'https://api.openai.com/v1', '', 120, 3, 'active');

INSERT INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, priority, max_concurrency, retry_times, retry_delay_ms, timeout_seconds, status, remark)
SELECT p.id, 'dall-e-3', 'DALL-E 3', 'image', 'text2img', 'dall-e-3', 10, 5, 3, 1000, 120, 'active', 'Default image generation model'
FROM ai_model_providers p
WHERE p.provider_key = 'openai'
  AND NOT EXISTS (SELECT 1 FROM ai_models m WHERE m.name = 'dall-e-3');

INSERT INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, priority, max_concurrency, retry_times, retry_delay_ms, timeout_seconds, status, remark)
SELECT p.id, 'dall-e-2', 'DALL-E 2', 'image', 'text2img,img2img,edit', 'dall-e-2', 5, 3, 3, 1000, 120, 'active', 'Fallback image generation model'
FROM ai_model_providers p
WHERE p.provider_key = 'openai'
  AND NOT EXISTS (SELECT 1 FROM ai_models m WHERE m.name = 'dall-e-2');

INSERT INTO app_configs (config_key, config_value, description) VALUES
('scenes', '[{"name":"Product promotion","prompt":"Clean product promotion image with clear subject and premium commercial style."},{"name":"Store promotion","prompt":"Friendly local store promotion image with clear event information."},{"name":"Brand intro","prompt":"Consistent brand visual with professional and trustworthy tone."}]', 'Scene list')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('styles', '["realistic","technology","minimal","cinematic","commercial"]', 'Style list')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('ratios', '[{"value":"1:1","preview":"square"},{"value":"16:9","preview":"landscape"},{"value":"9:16","preview":"story"},{"value":"4:5","preview":"portrait"}]', 'Ratio options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('qualities', '["standard","hd","ultra"]', 'Quality options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('image_types', '["text_to_image","image_to_image","image_edit"]', 'Image type options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('edit_tools', '[{"key":"cutout","name":"Cutout","prompt":"Remove the background and keep the main subject precisely."},{"key":"restore","name":"Restore","prompt":"Restore old photos and remove scratches, stains, and noise."},{"key":"styleTransfer","name":"Style transfer","prompt":"Apply the selected style while preserving the subject structure."}]', 'Image edit tools')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('video_ratios', '[{"value":"9:16","preview":"story"},{"value":"16:9","preview":"landscape"},{"value":"1:1","preview":"square"}]', 'Video ratio options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('video_styles', '["realistic","cinematic","commercial","anime","minimal"]', 'Video style options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('durations', '["5s","10s","15s","30s"]', 'Duration options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);

INSERT INTO app_configs (config_key, config_value, description) VALUES
('camera_moves', '["static","push_in","pull_out","pan_left","pan_right","tilt_up","tilt_down"]', 'Camera move options')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), description = VALUES(description);
