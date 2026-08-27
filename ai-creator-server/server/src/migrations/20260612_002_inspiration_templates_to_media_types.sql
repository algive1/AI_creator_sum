-- Normalize legacy inspiration templates into real image/video templates.
-- Inspiration is a display position, not a template_type.

UPDATE templates
   SET template_type = CASE
         WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.assetType')), '')) = 'video'
              OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.videoUrl')), '') <> ''
              OR preview_url REGEXP '\\.(mp4|mov|webm|avi)(\\?|$)'
           THEN 'video'
         ELSE 'image'
       END,
       target_feature = CASE
         WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.assetType')), '')) = 'video'
              OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.videoUrl')), '') <> ''
              OR preview_url REGEXP '\\.(mp4|mov|webm|avi)(\\?|$)'
           THEN CASE
             WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.app')), '')) = 'animatemix'
                  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.path')), '')) = 'animatemix'
               THEN 'video_edit'
             WHEN COALESCE(JSON_LENGTH(JSON_EXTRACT(params_json, '$.demoUrls')), 0) > 0
               THEN 'image_to_video'
             ELSE 'text_to_video'
           END
         ELSE CASE
           WHEN COALESCE(JSON_LENGTH(JSON_EXTRACT(params_json, '$.demoUrls')), 0) > 0
             THEN 'image_to_image'
           ELSE 'text_to_image'
         END
       END,
       usage_type = CASE
         WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.assetType')), '')) = 'video'
              OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.videoUrl')), '') <> ''
              OR preview_url REGEXP '\\.(mp4|mov|webm|avi)(\\?|$)'
           THEN CASE
             WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.app')), '')) = 'animatemix'
                  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.path')), '')) = 'animatemix'
               THEN 'video_edit'
             WHEN COALESCE(JSON_LENGTH(JSON_EXTRACT(params_json, '$.demoUrls')), 0) > 0
               THEN 'reference'
             ELSE 'generate'
           END
         ELSE CASE
           WHEN COALESCE(JSON_LENGTH(JSON_EXTRACT(params_json, '$.demoUrls')), 0) > 0
             THEN 'reference'
           ELSE 'generate'
         END
       END,
       display_config = CASE
         WHEN JSON_VALID(display_config) AND JSON_EXTRACT(display_config, '$.inspiration') IS NOT NULL
           THEN display_config
         WHEN JSON_VALID(display_config)
           THEN JSON_SET(display_config, '$.inspiration', JSON_OBJECT('pinned', false, 'pinOrder', 0))
         ELSE JSON_OBJECT('inspiration', JSON_OBJECT('pinned', false, 'pinOrder', 0))
       END,
       updated_at = NOW(3)
 WHERE template_type = 'inspiration'
   AND deleted_at IS NULL;
