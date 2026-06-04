-- 更新 CodesOnline 供应商的 Base URL 并确保 gpt-image-2 是 image_standard 的主模型
-- API Key 通过环境变量 CODESONLINE_IMAGE_API_KEY 同步，不写入迁移

-- 1. 更新 Base URL
UPDATE ai_model_providers
   SET api_base_url = 'https://direct.image.codesonline.dev/v1',
       updated_at = NOW(3)
 WHERE provider_key = 'codesonline_image' AND deleted_at IS NULL;

-- 2. 确保 image_standard 档位的主模型是 gpt-image-2 (codesonline)
SET @tier_id := (SELECT id FROM model_tiers WHERE tier_key = 'image_standard' AND status = 'active' LIMIT 1);
SET @mid_gpt2 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE p.provider_key = 'codesonline_image' AND m.name = 'gpt-image-2' AND m.deleted_at IS NULL LIMIT 1);

-- 仅当两者都存在时才更新绑定
INSERT INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_id, @mid_gpt2, 'primary', 0, 1, 1, 1
 WHERE @tier_id IS NOT NULL AND @mid_gpt2 IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM tier_model_bindings
      WHERE tier_id = @tier_id AND model_id = @mid_gpt2 AND binding_type = 'primary'
   );
