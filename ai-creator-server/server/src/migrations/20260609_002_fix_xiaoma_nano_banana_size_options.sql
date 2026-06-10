-- Fix Xiaoma Nano Banana model size presets according to the current Xiaoma API model detail.
-- Scope is intentionally limited to provider_key/provider_type = xiaoma.
-- This does not alter APIMart/Bagege Nano Banana variants, bindings, pricing, API keys, or historical tasks.

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.resolution_presets', JSON_ARRAY('1K', '2K', '4K'),
         '$.default_size_key', 'auto_2K',
         '$.supports_image_count', FALSE,
         '$.max_images', 1,
         '$.supported_ratios', JSON_ARRAY('auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'),
         '$.default_params', JSON_OBJECT('aspectRatio','auto','imageSize','2K'),
         '$.size_options',
         JSON_ARRAY(
           JSON_OBJECT('key','auto_1K','ratio','auto','resolutionPreset','1K','label','1K 自动'),
           JSON_OBJECT('key','auto_2K','ratio','auto','resolutionPreset','2K','label','2K 自动'),
           JSON_OBJECT('key','auto_4K','ratio','auto','resolutionPreset','4K','label','4K 自动'),
           JSON_OBJECT('key','1:1_1K','ratio','1:1','resolutionPreset','1K','label','1K 1:1'),
           JSON_OBJECT('key','2:3_1K','ratio','2:3','resolutionPreset','1K','label','1K 2:3'),
           JSON_OBJECT('key','3:2_1K','ratio','3:2','resolutionPreset','1K','label','1K 3:2'),
           JSON_OBJECT('key','3:4_1K','ratio','3:4','resolutionPreset','1K','label','1K 3:4'),
           JSON_OBJECT('key','4:3_1K','ratio','4:3','resolutionPreset','1K','label','1K 4:3'),
           JSON_OBJECT('key','4:5_1K','ratio','4:5','resolutionPreset','1K','label','1K 4:5'),
           JSON_OBJECT('key','5:4_1K','ratio','5:4','resolutionPreset','1K','label','1K 5:4'),
           JSON_OBJECT('key','9:16_1K','ratio','9:16','resolutionPreset','1K','label','1K 9:16'),
           JSON_OBJECT('key','16:9_1K','ratio','16:9','resolutionPreset','1K','label','1K 16:9'),
           JSON_OBJECT('key','21:9_1K','ratio','21:9','resolutionPreset','1K','label','1K 21:9'),
           JSON_OBJECT('key','1:1_2K','ratio','1:1','resolutionPreset','2K','label','2K 1:1'),
           JSON_OBJECT('key','2:3_2K','ratio','2:3','resolutionPreset','2K','label','2K 2:3'),
           JSON_OBJECT('key','3:2_2K','ratio','3:2','resolutionPreset','2K','label','2K 3:2'),
           JSON_OBJECT('key','3:4_2K','ratio','3:4','resolutionPreset','2K','label','2K 3:4'),
           JSON_OBJECT('key','4:3_2K','ratio','4:3','resolutionPreset','2K','label','2K 4:3'),
           JSON_OBJECT('key','4:5_2K','ratio','4:5','resolutionPreset','2K','label','2K 4:5'),
           JSON_OBJECT('key','5:4_2K','ratio','5:4','resolutionPreset','2K','label','2K 5:4'),
           JSON_OBJECT('key','9:16_2K','ratio','9:16','resolutionPreset','2K','label','2K 9:16'),
           JSON_OBJECT('key','16:9_2K','ratio','16:9','resolutionPreset','2K','label','2K 16:9'),
           JSON_OBJECT('key','21:9_2K','ratio','21:9','resolutionPreset','2K','label','2K 21:9'),
           JSON_OBJECT('key','1:1_4K','ratio','1:1','resolutionPreset','4K','label','4K 1:1'),
           JSON_OBJECT('key','2:3_4K','ratio','2:3','resolutionPreset','4K','label','4K 2:3'),
           JSON_OBJECT('key','3:2_4K','ratio','3:2','resolutionPreset','4K','label','4K 3:2'),
           JSON_OBJECT('key','3:4_4K','ratio','3:4','resolutionPreset','4K','label','4K 3:4'),
           JSON_OBJECT('key','4:3_4K','ratio','4:3','resolutionPreset','4K','label','4K 4:3'),
           JSON_OBJECT('key','4:5_4K','ratio','4:5','resolutionPreset','4K','label','4K 4:5'),
           JSON_OBJECT('key','5:4_4K','ratio','5:4','resolutionPreset','4K','label','4K 5:4'),
           JSON_OBJECT('key','9:16_4K','ratio','9:16','resolutionPreset','4K','label','4K 9:16'),
           JSON_OBJECT('key','16:9_4K','ratio','16:9','resolutionPreset','4K','label','4K 16:9'),
           JSON_OBJECT('key','21:9_4K','ratio','21:9','resolutionPreset','4K','label','4K 21:9')
         )
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND (
     m.api_model_name = 'gemini-3-pro-image-preview'
     OR m.upstream_model_code = 'gemini-3-pro-image-preview'
     OR m.name = 'gemini-3-pro-image-preview'
   );

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.resolution_presets', JSON_ARRAY('0.5K', '1K', '2K', '4K'),
         '$.default_size_key', 'auto_1K',
         '$.supports_image_count', FALSE,
         '$.max_images', 1,
         '$.supported_ratios', JSON_ARRAY('auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9','1:4','4:1','1:8','8:1'),
         '$.default_params', JSON_OBJECT('aspectRatio','auto','imageSize','1K','thinkingLevel','high'),
         '$.size_options',
         JSON_ARRAY(
           JSON_OBJECT('key','auto_0.5K','ratio','auto','resolutionPreset','0.5K','label','0.5K 自动'),
           JSON_OBJECT('key','auto_1K','ratio','auto','resolutionPreset','1K','label','1K 自动'),
           JSON_OBJECT('key','auto_2K','ratio','auto','resolutionPreset','2K','label','2K 自动'),
           JSON_OBJECT('key','auto_4K','ratio','auto','resolutionPreset','4K','label','4K 自动'),
           JSON_OBJECT('key','1:1_0.5K','ratio','1:1','resolutionPreset','0.5K','label','0.5K 1:1'),
           JSON_OBJECT('key','2:3_0.5K','ratio','2:3','resolutionPreset','0.5K','label','0.5K 2:3'),
           JSON_OBJECT('key','3:2_0.5K','ratio','3:2','resolutionPreset','0.5K','label','0.5K 3:2'),
           JSON_OBJECT('key','3:4_0.5K','ratio','3:4','resolutionPreset','0.5K','label','0.5K 3:4'),
           JSON_OBJECT('key','4:3_0.5K','ratio','4:3','resolutionPreset','0.5K','label','0.5K 4:3'),
           JSON_OBJECT('key','4:5_0.5K','ratio','4:5','resolutionPreset','0.5K','label','0.5K 4:5'),
           JSON_OBJECT('key','5:4_0.5K','ratio','5:4','resolutionPreset','0.5K','label','0.5K 5:4'),
           JSON_OBJECT('key','9:16_0.5K','ratio','9:16','resolutionPreset','0.5K','label','0.5K 9:16'),
           JSON_OBJECT('key','16:9_0.5K','ratio','16:9','resolutionPreset','0.5K','label','0.5K 16:9'),
           JSON_OBJECT('key','21:9_0.5K','ratio','21:9','resolutionPreset','0.5K','label','0.5K 21:9'),
           JSON_OBJECT('key','1:4_0.5K','ratio','1:4','resolutionPreset','0.5K','label','0.5K 1:4'),
           JSON_OBJECT('key','4:1_0.5K','ratio','4:1','resolutionPreset','0.5K','label','0.5K 4:1'),
           JSON_OBJECT('key','1:8_0.5K','ratio','1:8','resolutionPreset','0.5K','label','0.5K 1:8'),
           JSON_OBJECT('key','8:1_0.5K','ratio','8:1','resolutionPreset','0.5K','label','0.5K 8:1'),
           JSON_OBJECT('key','1:1_1K','ratio','1:1','resolutionPreset','1K','label','1K 1:1'),
           JSON_OBJECT('key','2:3_1K','ratio','2:3','resolutionPreset','1K','label','1K 2:3'),
           JSON_OBJECT('key','3:2_1K','ratio','3:2','resolutionPreset','1K','label','1K 3:2'),
           JSON_OBJECT('key','3:4_1K','ratio','3:4','resolutionPreset','1K','label','1K 3:4'),
           JSON_OBJECT('key','4:3_1K','ratio','4:3','resolutionPreset','1K','label','1K 4:3'),
           JSON_OBJECT('key','4:5_1K','ratio','4:5','resolutionPreset','1K','label','1K 4:5'),
           JSON_OBJECT('key','5:4_1K','ratio','5:4','resolutionPreset','1K','label','1K 5:4'),
           JSON_OBJECT('key','9:16_1K','ratio','9:16','resolutionPreset','1K','label','1K 9:16'),
           JSON_OBJECT('key','16:9_1K','ratio','16:9','resolutionPreset','1K','label','1K 16:9'),
           JSON_OBJECT('key','21:9_1K','ratio','21:9','resolutionPreset','1K','label','1K 21:9'),
           JSON_OBJECT('key','1:4_1K','ratio','1:4','resolutionPreset','1K','label','1K 1:4'),
           JSON_OBJECT('key','4:1_1K','ratio','4:1','resolutionPreset','1K','label','1K 4:1'),
           JSON_OBJECT('key','1:8_1K','ratio','1:8','resolutionPreset','1K','label','1K 1:8'),
           JSON_OBJECT('key','8:1_1K','ratio','8:1','resolutionPreset','1K','label','1K 8:1'),
           JSON_OBJECT('key','1:1_2K','ratio','1:1','resolutionPreset','2K','label','2K 1:1'),
           JSON_OBJECT('key','2:3_2K','ratio','2:3','resolutionPreset','2K','label','2K 2:3'),
           JSON_OBJECT('key','3:2_2K','ratio','3:2','resolutionPreset','2K','label','2K 3:2'),
           JSON_OBJECT('key','3:4_2K','ratio','3:4','resolutionPreset','2K','label','2K 3:4'),
           JSON_OBJECT('key','4:3_2K','ratio','4:3','resolutionPreset','2K','label','2K 4:3'),
           JSON_OBJECT('key','4:5_2K','ratio','4:5','resolutionPreset','2K','label','2K 4:5'),
           JSON_OBJECT('key','5:4_2K','ratio','5:4','resolutionPreset','2K','label','2K 5:4'),
           JSON_OBJECT('key','9:16_2K','ratio','9:16','resolutionPreset','2K','label','2K 9:16'),
           JSON_OBJECT('key','16:9_2K','ratio','16:9','resolutionPreset','2K','label','2K 16:9'),
           JSON_OBJECT('key','21:9_2K','ratio','21:9','resolutionPreset','2K','label','2K 21:9'),
           JSON_OBJECT('key','1:4_2K','ratio','1:4','resolutionPreset','2K','label','2K 1:4'),
           JSON_OBJECT('key','4:1_2K','ratio','4:1','resolutionPreset','2K','label','2K 4:1'),
           JSON_OBJECT('key','1:8_2K','ratio','1:8','resolutionPreset','2K','label','2K 1:8'),
           JSON_OBJECT('key','8:1_2K','ratio','8:1','resolutionPreset','2K','label','2K 8:1'),
           JSON_OBJECT('key','1:1_4K','ratio','1:1','resolutionPreset','4K','label','4K 1:1'),
           JSON_OBJECT('key','2:3_4K','ratio','2:3','resolutionPreset','4K','label','4K 2:3'),
           JSON_OBJECT('key','3:2_4K','ratio','3:2','resolutionPreset','4K','label','4K 3:2'),
           JSON_OBJECT('key','3:4_4K','ratio','3:4','resolutionPreset','4K','label','4K 3:4'),
           JSON_OBJECT('key','4:3_4K','ratio','4:3','resolutionPreset','4K','label','4K 4:3'),
           JSON_OBJECT('key','4:5_4K','ratio','4:5','resolutionPreset','4K','label','4K 4:5'),
           JSON_OBJECT('key','5:4_4K','ratio','5:4','resolutionPreset','4K','label','4K 5:4'),
           JSON_OBJECT('key','9:16_4K','ratio','9:16','resolutionPreset','4K','label','4K 9:16'),
           JSON_OBJECT('key','16:9_4K','ratio','16:9','resolutionPreset','4K','label','4K 16:9'),
           JSON_OBJECT('key','21:9_4K','ratio','21:9','resolutionPreset','4K','label','4K 21:9'),
           JSON_OBJECT('key','1:4_4K','ratio','1:4','resolutionPreset','4K','label','4K 1:4'),
           JSON_OBJECT('key','4:1_4K','ratio','4:1','resolutionPreset','4K','label','4K 4:1'),
           JSON_OBJECT('key','1:8_4K','ratio','1:8','resolutionPreset','4K','label','4K 1:8'),
           JSON_OBJECT('key','8:1_4K','ratio','8:1','resolutionPreset','4K','label','4K 8:1')
         )
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND (
     m.api_model_name = 'gemini-3.1-flash-image-preview'
     OR m.upstream_model_code = 'gemini-3.1-flash-image-preview'
     OR m.name = 'gemini-3.1-flash-image-preview'
   );
