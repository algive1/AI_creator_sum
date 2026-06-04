SET @provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'codesonline_image' AND deleted_at IS NULL);

INSERT INTO ai_model_providers (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, remark, created_at)
SELECT 'CodesOnline Image Relay', 'codesonline_image', 'openai_compatible', 'https://image.codesonline.dev/v1', '', 120, 3, 'active', 'OpenAI-compatible image relay with auto-routing, 2K/4K upscale, dual CDN fallback', NOW(3)
WHERE @provider_exists = 0;

SET @pid := (SELECT id FROM ai_model_providers WHERE provider_key = 'codesonline_image' AND deleted_at IS NULL LIMIT 1);

INSERT IGNORE INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, remark, status, created_at, updated_at)
VALUES
(@pid, 'auto', 'Auto Routing', 'image', 'text2img', 'auto', 'auto', 0, '', '{"response_format":"url","quality":"high"}', '', '{}', '{}', 120, 3, 1000, 0, 0, 5, 0, 2, 0, 1, 'Recommended default. 1K->standard, 2K/4K->codex. Supports upscale param.', 'active', NOW(3), NOW(3)),
(@pid, 'gpt-image-2', 'Standard Quality', 'image', 'text2img', 'gpt-image-2', 'gpt-image-2', 0, '', '{"response_format":"url","quality":"high"}', '', '{}', '{}', 120, 3, 1000, 0, 0, 5, 0, 2, 0, 2, 'Standard image generation. Supports local upscale to 2K/4K.', 'active', NOW(3), NOW(3)),
(@pid, 'gpt-image-2-codex', 'High Quality (2K/4K)', 'image', 'text2img', 'gpt-image-2-codex', 'gpt-image-2-codex', 0, '', '{"response_format":"url","quality":"high"}', '', '{}', '{}', 120, 3, 1000, 0, 0, 5, 0, 4, 0, 3, 'Codex high-quality link. For 2K/4K, product photos, photorealism. No free fallback.', 'active', NOW(3), NOW(3));
