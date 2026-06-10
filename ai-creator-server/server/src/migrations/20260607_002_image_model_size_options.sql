-- Align image model business size presets with the mini program parameter page.
-- No real API keys are stored here.

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.request_template = JSON_OBJECT('response_format', 'url'),
       m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.resolution_presets', JSON_ARRAY('auto', '1K', '2K', '4K'),
         '$.default_size_key', 'auto',
         '$.supports_image_count', TRUE,
         '$.max_images', 4,
         '$.supported_ratios', JSON_ARRAY('auto','1:1','2:3','3:2','3:4','4:3','9:16','16:9'),
         '$.size_options',
         JSON_ARRAY(
           JSON_OBJECT('key','auto','ratio','auto','resolutionPreset','auto','label','自动','upstreamSize','auto','isAuto',TRUE),
           JSON_OBJECT('key','1:1_1K','ratio','1:1','resolutionPreset','1K','label','1K 1:1','upstreamSize','1024x1024'),
           JSON_OBJECT('key','2:3_1K','ratio','2:3','resolutionPreset','1K','label','1K 2:3','upstreamSize','1024x1536'),
           JSON_OBJECT('key','3:2_1K','ratio','3:2','resolutionPreset','1K','label','1K 3:2','upstreamSize','1536x1024'),
           JSON_OBJECT('key','3:4_1K','ratio','3:4','resolutionPreset','1K','label','1K 3:4','upstreamSize','960x1280'),
           JSON_OBJECT('key','4:3_1K','ratio','4:3','resolutionPreset','1K','label','1K 4:3','upstreamSize','1280x960'),
           JSON_OBJECT('key','9:16_1K','ratio','9:16','resolutionPreset','1K','label','1K 9:16','upstreamSize','1088x1920'),
           JSON_OBJECT('key','16:9_1K','ratio','16:9','resolutionPreset','1K','label','1K 16:9','upstreamSize','1920x1088'),
           JSON_OBJECT('key','1:1_2K','ratio','1:1','resolutionPreset','2K','label','2K 1:1','upstreamSize','2048x2048'),
           JSON_OBJECT('key','2:3_2K','ratio','2:3','resolutionPreset','2K','label','2K 2:3','upstreamSize','2048x3072'),
           JSON_OBJECT('key','3:2_2K','ratio','3:2','resolutionPreset','2K','label','2K 3:2','upstreamSize','3072x2048'),
           JSON_OBJECT('key','3:4_2K','ratio','3:4','resolutionPreset','2K','label','2K 3:4','upstreamSize','1920x2560'),
           JSON_OBJECT('key','4:3_2K','ratio','4:3','resolutionPreset','2K','label','2K 4:3','upstreamSize','2560x1920'),
           JSON_OBJECT('key','9:16_2K','ratio','9:16','resolutionPreset','2K','label','2K 9:16','upstreamSize','1440x2560'),
           JSON_OBJECT('key','16:9_2K','ratio','16:9','resolutionPreset','2K','label','2K 16:9','upstreamSize','2560x1440'),
           JSON_OBJECT('key','1:1_4K','ratio','1:1','resolutionPreset','4K','label','4K 1:1','upstreamSize','2880x2880'),
           JSON_OBJECT('key','2:3_4K','ratio','2:3','resolutionPreset','4K','label','4K 2:3','upstreamSize','2304x3456'),
           JSON_OBJECT('key','3:2_4K','ratio','3:2','resolutionPreset','4K','label','4K 3:2','upstreamSize','3456x2304'),
           JSON_OBJECT('key','3:4_4K','ratio','3:4','resolutionPreset','4K','label','4K 3:4','upstreamSize','2400x3200'),
           JSON_OBJECT('key','4:3_4K','ratio','4:3','resolutionPreset','4K','label','4K 4:3','upstreamSize','3200x2400'),
           JSON_OBJECT('key','9:16_4K','ratio','9:16','resolutionPreset','4K','label','4K 9:16','upstreamSize','2160x3840'),
           JSON_OBJECT('key','16:9_4K','ratio','16:9','resolutionPreset','4K','label','4K 16:9','upstreamSize','3840x2160')
         )
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (
     LOWER(COALESCE(m.api_model_name, '')) LIKE '%gpt-image-2%'
     OR LOWER(COALESCE(m.upstream_model_code, '')) LIKE '%gpt-image-2%'
     OR REPLACE(LOWER(COALESCE(m.name, '')), '-', '') LIKE '%gptimage2%'
   );

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.resolution_presets', JSON_ARRAY('1K', '2K', '4K'),
         '$.default_size_key', CASE
           WHEN LOWER(COALESCE(m.name, '')) LIKE '%pro%' THEN 'auto_2K'
           WHEN LOWER(COALESCE(m.display_name, '')) LIKE '%pro%' THEN 'auto_2K'
           ELSE 'auto_1K'
         END,
         '$.supports_image_count', FALSE,
         '$.max_images', 1,
         '$.supported_ratios', JSON_ARRAY('auto','1:1','3:4','4:3','4:5','9:16','16:9','21:9'),
         '$.size_options',
         JSON_ARRAY(
           JSON_OBJECT('key','auto_1K','ratio','auto','resolutionPreset','1K','label','1K 自动'),
           JSON_OBJECT('key','auto_2K','ratio','auto','resolutionPreset','2K','label','2K 自动'),
           JSON_OBJECT('key','auto_4K','ratio','auto','resolutionPreset','4K','label','4K 自动'),
           JSON_OBJECT('key','1:1_1K','ratio','1:1','resolutionPreset','1K','label','1K 1:1'),
           JSON_OBJECT('key','3:4_1K','ratio','3:4','resolutionPreset','1K','label','1K 3:4'),
           JSON_OBJECT('key','4:3_1K','ratio','4:3','resolutionPreset','1K','label','1K 4:3'),
           JSON_OBJECT('key','4:5_1K','ratio','4:5','resolutionPreset','1K','label','1K 4:5'),
           JSON_OBJECT('key','9:16_1K','ratio','9:16','resolutionPreset','1K','label','1K 9:16'),
           JSON_OBJECT('key','16:9_1K','ratio','16:9','resolutionPreset','1K','label','1K 16:9'),
           JSON_OBJECT('key','21:9_1K','ratio','21:9','resolutionPreset','1K','label','1K 21:9'),
           JSON_OBJECT('key','1:1_2K','ratio','1:1','resolutionPreset','2K','label','2K 1:1'),
           JSON_OBJECT('key','3:4_2K','ratio','3:4','resolutionPreset','2K','label','2K 3:4'),
           JSON_OBJECT('key','4:3_2K','ratio','4:3','resolutionPreset','2K','label','2K 4:3'),
           JSON_OBJECT('key','4:5_2K','ratio','4:5','resolutionPreset','2K','label','2K 4:5'),
           JSON_OBJECT('key','9:16_2K','ratio','9:16','resolutionPreset','2K','label','2K 9:16'),
           JSON_OBJECT('key','16:9_2K','ratio','16:9','resolutionPreset','2K','label','2K 16:9'),
           JSON_OBJECT('key','21:9_2K','ratio','21:9','resolutionPreset','2K','label','2K 21:9'),
           JSON_OBJECT('key','1:1_4K','ratio','1:1','resolutionPreset','4K','label','4K 1:1'),
           JSON_OBJECT('key','3:4_4K','ratio','3:4','resolutionPreset','4K','label','4K 3:4'),
           JSON_OBJECT('key','4:3_4K','ratio','4:3','resolutionPreset','4K','label','4K 4:3'),
           JSON_OBJECT('key','4:5_4K','ratio','4:5','resolutionPreset','4K','label','4K 4:5'),
           JSON_OBJECT('key','9:16_4K','ratio','9:16','resolutionPreset','4K','label','4K 9:16'),
           JSON_OBJECT('key','16:9_4K','ratio','16:9','resolutionPreset','4K','label','4K 16:9'),
           JSON_OBJECT('key','21:9_4K','ratio','21:9','resolutionPreset','4K','label','4K 21:9')
         )
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (
     REPLACE(LOWER(COALESCE(m.name, '')), '-', '') LIKE '%nanobanana%'
     OR REPLACE(LOWER(COALESCE(m.display_name, '')), ' ', '') LIKE '%nanobanana%'
     OR (
       LOWER(COALESCE(m.api_model_name, '')) LIKE '%gemini%'
       AND LOWER(COALESCE(m.api_model_name, '')) LIKE '%image-preview%'
     )
     OR (
       LOWER(COALESCE(m.upstream_model_code, '')) LIKE '%gemini%'
       AND LOWER(COALESCE(m.upstream_model_code, '')) LIKE '%image-preview%'
     )
   )
   AND NOT (
     LOWER(COALESCE(m.api_model_name, '')) LIKE '%gpt-image-2%'
     OR LOWER(COALESCE(m.upstream_model_code, '')) LIKE '%gpt-image-2%'
     OR REPLACE(LOWER(COALESCE(m.name, '')), '-', '') LIKE '%gptimage2%'
   );
