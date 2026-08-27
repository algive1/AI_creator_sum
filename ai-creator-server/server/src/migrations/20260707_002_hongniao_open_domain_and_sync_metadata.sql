-- Update Hongniao provider endpoint to the new official open domain.
-- Model rows are refreshed by the admin model sync action, not by this migration.
-- When a remote model disappears during sync, runtime marks ai_models.config.upstream_removed_at.

UPDATE ai_model_providers
   SET api_base_url = REPLACE(api_base_url, 'https://hongniaoai.com', 'https://open.hongniaoai.com'),
       remark = CASE
         WHEN remark IS NULL OR remark = '' THEN 'Hongniao async image/video API. Uses X-API-Key. Models sync from /v1/models.'
         WHEN remark NOT LIKE '%/v1/models%' THEN CONCAT(remark, ' Models sync from /v1/models.')
         ELSE remark
       END,
       updated_at = NOW(3)
 WHERE deleted_at IS NULL
   AND (provider_key = 'hongniao' OR provider_type = 'hongniao')
   AND api_base_url LIKE 'https://hongniaoai.com%';

UPDATE ai_model_providers
   SET api_base_url = 'https://open.hongniaoai.com/v1',
       remark = CASE
         WHEN remark IS NULL OR remark = '' THEN 'Hongniao async image/video API. Uses X-API-Key. Models sync from /v1/models.'
         WHEN remark NOT LIKE '%/v1/models%' THEN CONCAT(remark, ' Models sync from /v1/models.')
         ELSE remark
       END,
       updated_at = NOW(3)
 WHERE deleted_at IS NULL
   AND (provider_key = 'hongniao' OR provider_type = 'hongniao')
   AND (api_base_url IS NULL OR api_base_url = '');
