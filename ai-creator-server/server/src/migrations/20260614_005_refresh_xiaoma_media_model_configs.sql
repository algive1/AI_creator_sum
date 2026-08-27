-- Refresh Xiaoma media model configs from the 2026-06-14 API skill docs.
-- Scope: known Xiaoma video/audio model metadata, media task polling URL, and
-- Xiaoma public tier capability columns. This does not touch API keys, pricing,
-- user balances, generated tasks, or non-Xiaoma providers.

DROP TEMPORARY TABLE IF EXISTS tmp_xiaoma_media_model_config_refresh;
CREATE TEMPORARY TABLE tmp_xiaoma_media_model_config_refresh (
  model_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  model_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  capabilities JSON NOT NULL,
  param_names JSON NOT NULL,
  supported_ratios JSON NOT NULL,
  supported_qualities JSON NOT NULL,
  supported_durations JSON NOT NULL,
  supported_audio_modes JSON NOT NULL,
  default_audio_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'silent',
  supported_size_modes JSON NOT NULL,
  input_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  reference_upload_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  min_reference_images INT NULL,
  max_reference_images INT NULL,
  default_params JSON NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_xiaoma_media_model_config_refresh
  (model_name, model_type, capabilities, param_names, supported_ratios, supported_qualities, supported_durations, supported_audio_modes, default_audio_mode, supported_size_modes, input_mode, reference_upload_mode, min_reference_images, max_reference_images, default_params)
VALUES
('sora-2','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('duration','orientation','input_reference','aspect_ratio','size','seconds','watermark','private'),JSON_ARRAY('16:9','9:16'),JSON_ARRAY(),JSON_ARRAY('4s','8s','12s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'first_frame','first_frame',0,1,JSON_OBJECT('duration','4','orientation','landscape','watermark',FALSE,'private',FALSE)),
('kwvideo-v2-ref','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('version','duration','aspect_ratio','resolution','images'),JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),JSON_ARRAY('480p','720p'),JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,9,JSON_OBJECT('duration','auto','aspect_ratio','adaptive','resolution','720p')),
('grok-video-3','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('prompt','images','aspect_ratio','size','duration'),JSON_ARRAY('2:3','3:2','1:1'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('6s','10s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'first_frame','first_frame',0,1,JSON_OBJECT('aspect_ratio','3:2','size','720P','duration','6')),
('grok-imagine-video-1.5-preview','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('prompt','images','aspect_ratio','resolution','duration'),JSON_ARRAY('16:9','9:16','1:1','3:2','2:3'),JSON_ARRAY('720p','480p'),JSON_ARRAY('1s','2s','3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_frame','first_frame',1,1,JSON_OBJECT('aspect_ratio','16:9','resolution','720p','duration','5')),
('doubao-seedance-1-5-pro-251215','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('images','audio_duration','resolution','ratio','generate_audio'),JSON_ARRAY('adaptive','16:9','9:16','1:1','3:4','4:3'),JSON_ARRAY('480p','720p','1080p'),JSON_ARRAY('4s','8s','12s'),JSON_ARRAY('audio','silent'),'silent',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('audio_duration','4','resolution','720p','ratio','16:9','generate_audio',FALSE)),
('kling-v3-omni-cankao','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('duration','images','prompt','mode','aspect_ratio'),JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('duration','5','mode','std','aspect_ratio','16:9')),
('happyhorse-r2v','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('prompt','images','resolution','duration','ratio','aspect_ratio'),JSON_ARRAY('16:9','9:16','3:4','4:3','1:1'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'reference_images','reference_images',1,5,JSON_OBJECT('resolution','720P','duration','5','ratio','16:9')),
('kwvideo-v2-quannengcankao','video',JSON_ARRAY('image_to_video','video_edit'),JSON_ARRAY('_quan_neng_mode','duration','aspect_ratio','resolution','image_url','video_url','audio_url'),JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),JSON_ARRAY('480p','720p','1080p'),JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,9,JSON_OBJECT('_quan_neng_mode','quan_neng','duration','auto','aspect_ratio','adaptive','resolution','720p')),
('veo3.1','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('prompt','generation_mode','aspect_ratio','images','enhance_prompt','enable_upsample','duration','generation_type','quality'),JSON_ARRAY('9:16','16:9'),JSON_ARRAY('1080p'),JSON_ARRAY('8s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('generation_mode','fast','aspect_ratio','16:9','enhance_prompt',TRUE,'enable_upsample',FALSE,'duration','8','generation_type','TEXT','quality','1080p')),
('kwvideo-v2','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('version','duration','aspect_ratio','resolution','images'),JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),JSON_ARRAY('480p','720p'),JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('duration','auto','aspect_ratio','adaptive','resolution','720p')),
('happyhorse-video-edit','video',JSON_ARRAY('video_edit'),JSON_ARRAY('prompt','video','images','resolution','audio_setting','watermark'),JSON_ARRAY(),JSON_ARRAY('720P','1080P'),JSON_ARRAY(),JSON_ARRAY('audio','silent'),'silent',JSON_ARRAY('ratio'),'source_video','source_video',1,5,JSON_OBJECT('resolution','720P','audio_setting','auto','watermark',FALSE)),
('viduq3','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('images','model_variant','resolution','duration','aspect_ratio','off_peak'),JSON_ARRAY('16:9','9:16','4:3','3:4','1:1'),JSON_ARRAY('540p','720p','1080p'),JSON_ARRAY('4s','8s','12s','16s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('model_variant','turbo','resolution','720p','duration','4','aspect_ratio','16:9','off_peak',FALSE)),
('happyhorse-t2v','video',JSON_ARRAY('text_to_video'),JSON_ARRAY('prompt','resolution','ratio','duration'),JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'text','none',0,0,JSON_OBJECT('resolution','720P','ratio','16:9','duration','5')),
('viduq3-cankaosheng','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('model_version','images','resolution','duration','aspect_ratio','watermark','off_peak'),JSON_ARRAY('auto','16:9','9:16','4:3','3:4','1:1'),JSON_ARRAY('720p','1080p','540p'),JSON_ARRAY('4s','8s','12s','16s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('model_version','viduq3','resolution','720p','duration','4','aspect_ratio','auto','watermark',TRUE,'off_peak',FALSE)),
('veo3.1-4k','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('prompt','generation_mode','aspect_ratio','images','enhance_prompt','enable_upsample','duration','generation_type','quality'),JSON_ARRAY('9:16','16:9'),JSON_ARRAY('4k'),JSON_ARRAY('8s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('generation_mode','fast','aspect_ratio','16:9','enhance_prompt',TRUE,'enable_upsample',FALSE,'duration','8','generation_type','TEXT','quality','4k')),
('omni-flash','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('prompt','images','aspect_ratio','duration','enhance_prompt','enable_upsample'),JSON_ARRAY('16:9','9:16'),JSON_ARRAY(),JSON_ARRAY('6s','8s','10s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',0,3,JSON_OBJECT('aspect_ratio','16:9','duration','8','enhance_prompt',FALSE,'enable_upsample',FALSE)),
('pixverse-v6-shouweizhen','video',JSON_ARRAY('image_to_video','first_last_frame_video'),JSON_ARRAY('resolution','duration','images','aspect_ratio'),JSON_ARRAY('16:9','4:3','1:1','3:4','9:16','3:2','2:3','21:9'),JSON_ARRAY('360P','540P','720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',1,2,JSON_OBJECT('resolution','720P','duration','6','aspect_ratio','16:9')),
('happyhorse-i2v','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('prompt','images','_first_frame_url','resolution','duration'),JSON_ARRAY(),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'first_frame','first_frame',1,1,JSON_OBJECT('resolution','720P','duration','5')),
('kling-motion-control-v3','video',JSON_ARRAY('video_edit'),JSON_ARRAY('prompt','image_url','video_url','keep_original_sound','character_orientation','mode'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY('audio','silent'),'audio',JSON_ARRAY('ratio'),'source_video','source_video',1,1,JSON_OBJECT('keep_original_sound','yes','character_orientation','video','mode','std')),
('kling-v3-omni-shouweizhen','video',JSON_ARRAY('image_to_video','first_last_frame_video'),JSON_ARRAY('duration','images','prompt','mode'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY('5s','10s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',1,2,JSON_OBJECT('duration','5','mode','std')),
('vidu-mv','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('images','audio_url','resolution','lip_ref_url','lip_sync','aspect_ratio','style','add_subtitle','prompt','duration'),JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'),JSON_ARRAY('540p','720p','1080p'),JSON_ARRAY(),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('resolution','720p','lip_sync',FALSE,'aspect_ratio','16:9','duration','30')),
('wan2.6-cankaosheng','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('prompt','reference_urls','quality','resolution','aspect_ratio','duration','shot_type'),JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('2s','4s','6s','8s','10s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('quality','fast','resolution','720P','aspect_ratio','16:9','duration','4','shot_type','single')),
('kling-motion-control','video',JSON_ARRAY('video_edit'),JSON_ARRAY('prompt','image_url','video_url','keep_original_sound','character_orientation','mode'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY('audio','silent'),'audio',JSON_ARRAY('ratio'),'source_video','source_video',1,1,JSON_OBJECT('keep_original_sound','yes','character_orientation','video','mode','std')),
('wan2.6-shouzheng','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('prompt','img_url','audio_url','quality','resolution','aspect_ratio','duration','shot_type','prompt_extend'),JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_frame','first_frame',0,1,JSON_OBJECT('quality','fast','resolution','720P','aspect_ratio','16:9','duration','6','shot_type','single','prompt_extend',TRUE)),
('kling-v3-video','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('duration','images','prompt','mode','aspect_ratio'),JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('duration','5','mode','std','aspect_ratio','16:9')),
('kling-avatar-image2video','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('image','sound_file','prompt','mode'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_frame','first_frame',1,1,JSON_OBJECT('mode','std')),
('pixverse-c1-cankaosheng','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('resolution','duration','aspect_ratio','images'),JSON_ARRAY('16:9','9:16','1:1','3:4','4:3','3:2','2:3','21:9'),JSON_ARRAY('360P','540P','720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('resolution','720P','duration','6','aspect_ratio','16:9')),
('wan2.7-cankaosheng','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('prompt','reference_urls','reference_video','resolution','duration','prompt_extend','ratio','_mode'),JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',0,7,JSON_OBJECT('resolution','720P','duration','6','prompt_extend',TRUE,'ratio','16:9','_mode','wan2.7-r2v')),
('kling-v3-omni-videoref','video',JSON_ARRAY('video_edit'),JSON_ARRAY('duration','images','video','refer_type','keep_original_sound','prompt','mode','aspect_ratio'),JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s'),JSON_ARRAY('audio','silent'),'audio',JSON_ARRAY('ratio'),'source_video','source_video',1,7,JSON_OBJECT('duration','5','refer_type','feature','keep_original_sound','yes','mode','std','aspect_ratio','16:9')),
('wan2.2-animate-mix','video',JSON_ARRAY('video_edit'),JSON_ARRAY('image_url','video_url','mode'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'source_video','source_video',1,1,JSON_OBJECT('mode','wan-std')),
('viduq2-cankaosheng','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('images','resolution','duration','aspect_ratio'),JSON_ARRAY('16:9','9:16','4:3','3:4','1:1'),JSON_ARRAY('540p','720p','1080p'),JSON_ARRAY('5s','10s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('resolution','720p','duration','5','aspect_ratio','16:9')),
('pixverse-c1-shouweizhen','video',JSON_ARRAY('image_to_video','first_last_frame_video'),JSON_ARRAY('resolution','duration','images'),JSON_ARRAY(),JSON_ARRAY('360P','540P','720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',1,2,JSON_OBJECT('resolution','720P','duration','6')),
('kling-v2-6','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('duration','images','prompt','negative_prompt','sound','aspect_ratio'),JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s'),JSON_ARRAY('audio','silent'),'audio',JSON_ARRAY('ratio'),'first_frame','first_frame',0,1,JSON_OBJECT('duration','5','sound','on','aspect_ratio','16:9')),
('pixverse-v5.6-r2v','video',JSON_ARRAY('image_to_video'),JSON_ARRAY('prompt','images','resolution','duration','aspect_ratio'),JSON_ARRAY('16:9','4:3','1:1','3:4','9:16'),JSON_ARRAY('360P','540P','720P','1080P'),JSON_ARRAY('5s','8s','10s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'reference_images','reference_images',1,7,JSON_OBJECT('resolution','720P','duration','5','aspect_ratio','16:9')),
('wan2.7-shouweizhen','video',JSON_ARRAY('image_to_video','first_last_frame_video'),JSON_ARRAY('prompt','images','resolution','duration','prompt_extend'),JSON_ARRAY(),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',1,2,JSON_OBJECT('resolution','720P','duration','6','prompt_extend',TRUE)),
('vidu-jieshuoman','video',JSON_ARRAY('text_to_video'),JSON_ARRAY('script_name','script_content','assets','duration','resolution','aspect_ratio','style','language','tts_speed','enable_lipsync'),JSON_ARRAY('16:9','9:16','4:3','3:4'),JSON_ARRAY('720p','1080p'),JSON_ARRAY(),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'text','none',0,0,JSON_OBJECT('resolution','720p','aspect_ratio','16:9','language','zh','tts_speed',1,'enable_lipsync',TRUE)),
('pixverse-v5.6-shouweizhen','video',JSON_ARRAY('image_to_video','first_last_frame_video'),JSON_ARRAY('resolution','duration','images','aspect_ratio'),JSON_ARRAY('16:9','4:3','1:1','3:4','9:16'),JSON_ARRAY('360P','540P','720P','1080P'),JSON_ARRAY('5s','8s','10s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'first_last','first_last',1,2,JSON_OBJECT('resolution','720P','duration','5','aspect_ratio','16:9')),
('wan2.7-xuxie','video',JSON_ARRAY('video_edit'),JSON_ARRAY('prompt','clips','resolution','duration','prompt_extend'),JSON_ARRAY(),JSON_ARRAY('720P','1080P'),JSON_ARRAY('3s','6s','9s','12s','15s'),JSON_ARRAY('audio'),'audio',JSON_ARRAY('ratio'),'source_video','source_video',1,1,JSON_OBJECT('resolution','720P','duration','6','prompt_extend',TRUE)),
('hailuo-2.3','video',JSON_ARRAY('text_to_video','image_to_video'),JSON_ARRAY('model_version','duration','resolution','enhance_prompt','prompt'),JSON_ARRAY(),JSON_ARRAY('768P','1080P'),JSON_ARRAY('6s','10s'),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'text','none',0,0,JSON_OBJECT('model_version','2.3-fast','duration','6','resolution','768P','enhance_prompt','Enabled')),
('veo3.1-lite','video',JSON_ARRAY('text_to_video','image_to_video','first_last_frame_video'),JSON_ARRAY('prompt','quality','aspect_ratio','images','enhance_prompt'),JSON_ARRAY('9:16','16:9'),JSON_ARRAY('sd','4k'),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY('ratio'),'first_last','first_last',0,2,JSON_OBJECT('quality','sd','aspect_ratio','16:9','enhance_prompt',TRUE)),
('speech-2.8','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY('speed','pitch','emotion','sound_effects','quality'),JSON_ARRAY(),JSON_ARRAY('turbo','hd'),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT('speed','1','pitch','0','emotion','auto','sound_effects','none','quality','turbo')),
('music-2.5+','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY('lyrics','is_instrumental','sample_rate','bitrate'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT('is_instrumental','song','sample_rate','44100','bitrate','128000')),
('suno-v4.5','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY('mv','make_instrumental','vocal_gender','sample_rate','bitrate'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT('mv','chirp-v4-5','make_instrumental','song','vocal_gender','auto','sample_rate','44100','bitrate','128000')),
('doubao-tts-2.0','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY('speech_rate','emotion','emotion_scale','format'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT('speech_rate','0','emotion','auto','emotion_scale','1','format','mp3')),
('music-2.5','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY('lyrics','is_instrumental','sample_rate','bitrate'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT('is_instrumental','song','sample_rate','44100','bitrate','128000')),
('gemini-3.1-flash-tts-preview','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT()),
('gemini-2.5-pro-preview-tts','audio',JSON_ARRAY('audio_generation'),JSON_ARRAY('model_version'),JSON_ARRAY(),JSON_ARRAY('pro','flash'),JSON_ARRAY(),JSON_ARRAY(),'silent',JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_OBJECT('model_version','pro'));

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.query_task_url = '/v1/skills/task-status?task_id={task_id}',
       m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.endpoints.create', '/v1/media/generate',
         '$.endpoints.query', '/v1/skills/task-status?task_id={task_id}',
         '$.api_format', 'xiaoma_media'
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.model_type IN ('image','video','audio');

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
JOIN tmp_xiaoma_media_model_config_refresh x ON x.model_name = m.api_model_name COLLATE utf8mb4_unicode_ci
   SET m.model_type = x.model_type,
       m.sub_type = CASE
         WHEN x.model_type = 'audio' AND (m.sub_type IS NULL OR m.sub_type = '') THEN 'audio_generation'
         ELSE m.sub_type
       END,
       m.query_task_url = '/v1/skills/task-status?task_id={task_id}',
       m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.source', 'xiaoma_api_docs',
         '$.source_checked_at', '2026-06-14',
         '$.capabilities', x.capabilities,
         '$.param_names', x.param_names,
         '$.supported_ratios', x.supported_ratios,
         '$.supported_qualities', x.supported_qualities,
         '$.supported_durations', x.supported_durations,
         '$.supported_audio_modes', x.supported_audio_modes,
         '$.default_audio_mode', x.default_audio_mode,
         '$.supported_size_modes', x.supported_size_modes,
         '$.input_mode', x.input_mode,
         '$.reference_upload_mode', x.reference_upload_mode,
         '$.min_reference_images', x.min_reference_images,
         '$.max_reference_images', x.max_reference_images,
         '$.default_params', x.default_params,
         '$.endpoints.create', '/v1/media/generate',
         '$.endpoints.query', '/v1/skills/task-status?task_id={task_id}',
         '$.api_format', 'xiaoma_media'
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma');

UPDATE tier_capabilities c
JOIN model_tiers t ON t.id = c.tier_id
JOIN tier_model_bindings b ON b.tier_id = t.id AND b.binding_type = 'primary'
JOIN ai_models m ON m.id = b.model_id AND m.deleted_at IS NULL
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
JOIN tmp_xiaoma_media_model_config_refresh x ON x.model_name = m.api_model_name COLLATE utf8mb4_unicode_ci
   SET c.supported_ratios = x.supported_ratios,
       c.supported_qualities = x.supported_qualities,
       c.supported_durations = x.supported_durations,
       c.supported_audio_modes = CASE WHEN JSON_LENGTH(x.supported_audio_modes) > 0 THEN x.supported_audio_modes ELSE NULL END,
       c.default_audio_mode = x.default_audio_mode,
       c.supported_size_modes = x.supported_size_modes,
       c.input_mode = x.input_mode,
       c.reference_upload_mode = x.reference_upload_mode,
       c.min_reference_images = x.min_reference_images,
       c.required_reference = CASE WHEN COALESCE(x.min_reference_images, 0) > 0 THEN 1 ELSE 0 END,
       c.max_images = COALESCE(x.max_reference_images, c.max_images),
       c.max_reference_images = COALESCE(x.max_reference_images, c.max_reference_images),
       c.updated_at = NOW(3)
 WHERE t.status = 'active'
   AND t.tier_key LIKE 'xiaoma\_%'
   AND x.model_type = 'video'
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma');

DROP TEMPORARY TABLE IF EXISTS tmp_xiaoma_media_model_config_refresh;
