-- Fix GPT Image 2 business size presets according to the current Xiaoma API model detail.
-- The provider accepts 22 size values: auto plus 1K/2K/4K across 7 aspect ratios.
-- This migration only corrects model config; it does not change bindings, pricing, API keys, or historical tasks.

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
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
