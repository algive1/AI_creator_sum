-- Fix Xiaoma video model capability config for the first release batch.
-- Scope is intentionally limited to provider_key/provider_type = xiaoma.
-- This migration corrects video capability metadata only; it does not touch API keys or historical tasks.

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('16:9','9:16'),
         '$.supported_durations', JSON_ARRAY('4s','8s','12s'),
         '$.supported_qualities', JSON_ARRAY(),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video'),
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_frame',
         '$.reference_upload_mode', 'first_frame',
         '$.min_reference_images', 0,
         '$.max_reference_images', 1,
         '$.default_params', JSON_OBJECT('duration','4','orientation','landscape','watermark',FALSE,'private',FALSE)
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'sora-2';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('2:3','3:2','1:1'),
         '$.supported_durations', JSON_ARRAY('6s','10s'),
         '$.supported_qualities', JSON_ARRAY('720P','1080P'),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video'),
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_frame',
         '$.reference_upload_mode', 'first_frame',
         '$.min_reference_images', 0,
         '$.max_reference_images', 1,
         '$.default_params', JSON_OBJECT('duration','6','size','720P')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'grok-video-3';

INSERT INTO ai_models
  (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
SELECT p.id,
       'grok-imagine-video-1.5-preview',
       'grok Imagine video1.5',
       'video',
       'image_to_video',
       'grok-imagine-video-1.5-preview',
       'grok-imagine-video-1.5-preview',
       1, '', '{}', '', '{}', '{}',
       600, 3, 1000, 0, 0, 5, 0, 20, 0, 3981,
       JSON_OBJECT(
         'source','xiaoma_api_docs',
         'source_checked_at','2026-06-09',
         'capabilities', JSON_ARRAY('image_to_video'),
         'tags', JSON_ARRAY('Image-to-video','First-frame reference','Built-in audio','1-15s','HD'),
         'default_params', JSON_OBJECT('duration','5','aspect_ratio','16:9','resolution','720p'),
         'param_names', JSON_ARRAY('prompt','images','aspect_ratio','resolution','duration'),
         'supported_ratios', JSON_ARRAY('16:9','9:16','1:1','3:2','2:3'),
         'supported_durations', JSON_ARRAY('1s','2s','3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),
         'supported_qualities', JSON_ARRAY('720p','480p'),
         'supported_audio_modes', JSON_ARRAY('audio'),
         'default_audio_mode', 'audio',
         'supported_size_modes', JSON_ARRAY('ratio'),
         'input_mode', 'first_frame',
         'reference_upload_mode', 'first_frame',
         'min_reference_images', 1,
         'max_reference_images', 1,
         'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
         'api_format', 'xiaoma_media',
         'description', 'xAI official Imagine 1.5 video model, focused on image-to-video with a single first-frame reference.'
       ),
       'grok Imagine video1.5 is an xAI official image-to-video model with a required first-frame reference image.',
       'active',
       NOW(3),
       NOW(3)
  FROM ai_model_providers p
 WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND p.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM ai_models m
      WHERE m.provider_id = p.id
        AND m.api_model_name = 'grok-imagine-video-1.5-preview'
        AND m.deleted_at IS NULL
   );

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('16:9','9:16','1:1','3:2','2:3'),
         '$.supported_durations', JSON_ARRAY('1s','2s','3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),
         '$.supported_qualities', JSON_ARRAY('720p','480p'),
         '$.capabilities', JSON_ARRAY('image_to_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_frame',
         '$.reference_upload_mode', 'first_frame',
         '$.min_reference_images', 1,
         '$.max_reference_images', 1,
         '$.default_params', JSON_OBJECT('duration','5','aspect_ratio','16:9','resolution','720p')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'grok-imagine-video-1.5-preview';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('adaptive','16:9','9:16','1:1','3:4','4:3'),
         '$.supported_durations', JSON_ARRAY('4s','8s','12s'),
         '$.supported_qualities', JSON_ARRAY('480p','720p','1080p'),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio','silent'),
         '$.default_audio_mode', 'silent',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 0,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('audio_duration','4','resolution','720p','ratio','16:9','generate_audio',FALSE)
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'doubao-seedance-1-5-pro-251215';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('16:9','9:16','1:1'),
         '$.supported_durations', JSON_ARRAY('5s','10s','15s'),
         '$.supported_qualities', JSON_ARRAY(),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 0,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('duration','5','mode','std','aspect_ratio','16:9')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'kling-v3-video';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('16:9','9:16','1:1'),
         '$.supported_durations', JSON_ARRAY('5s','10s','15s'),
         '$.supported_qualities', JSON_ARRAY(),
         '$.capabilities', JSON_ARRAY('image_to_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'reference_images',
         '$.reference_upload_mode', 'reference_images',
         '$.min_reference_images', 1,
         '$.max_reference_images', 7,
         '$.default_params', JSON_OBJECT('duration','5','mode','std','aspect_ratio','16:9')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'kling-v3-omni-cankao';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY(),
         '$.supported_durations', JSON_ARRAY('5s','10s','15s'),
         '$.supported_qualities', JSON_ARRAY(),
         '$.capabilities', JSON_ARRAY('image_to_video','first_last_frame_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 1,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('duration','5','mode','std')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'kling-v3-omni-shouweizhen';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('9:16','16:9'),
         '$.supported_durations', JSON_ARRAY('8s'),
         '$.supported_qualities', JSON_ARRAY('1080p'),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 0,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('generation_mode','fast','aspect_ratio','16:9','enhance_prompt',TRUE,'enable_upsample',FALSE,'duration','8','generation_type','TEXT','quality','1080p')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'veo3.1';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('9:16','16:9'),
         '$.supported_durations', JSON_ARRAY('8s'),
         '$.supported_qualities', JSON_ARRAY('4k'),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 0,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('generation_mode','fast','aspect_ratio','16:9','enhance_prompt',TRUE,'enable_upsample',FALSE,'duration','8','generation_type','TEXT','quality','4k')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'veo3.1-4k';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('9:16','16:9'),
         '$.supported_durations', JSON_ARRAY(),
         '$.supported_qualities', JSON_ARRAY('sd','4k'),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 0,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('quality','sd','aspect_ratio','16:9','enhance_prompt',TRUE)
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'veo3.1-lite';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('16:9','9:16'),
         '$.supported_durations', JSON_ARRAY('6s','8s','10s'),
         '$.supported_qualities', JSON_ARRAY(),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'reference_images',
         '$.reference_upload_mode', 'reference_images',
         '$.min_reference_images', 0,
         '$.max_reference_images', 3,
         '$.default_params', JSON_OBJECT('duration','8','aspect_ratio','16:9','enhance_prompt',FALSE,'enable_upsample',FALSE)
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'omni-flash';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),
         '$.supported_durations', JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),
         '$.supported_qualities', JSON_ARRAY('480p','720p'),
         '$.capabilities', JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'first_last',
         '$.reference_upload_mode', 'first_last',
         '$.min_reference_images', 0,
         '$.max_reference_images', 2,
         '$.default_params', JSON_OBJECT('version','标准','duration','auto','aspect_ratio','adaptive','resolution','720p')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'kwvideo-v2';

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),
         '$.supported_durations', JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),
         '$.supported_qualities', JSON_ARRAY('480p','720p'),
         '$.capabilities', JSON_ARRAY('image_to_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'reference_images',
         '$.reference_upload_mode', 'reference_images',
         '$.min_reference_images', 1,
         '$.max_reference_images', 9,
         '$.default_params', JSON_OBJECT('version','标准','duration','auto','aspect_ratio','adaptive','resolution','720p')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'kwvideo-v2-ref';
