-- 将小马AI图片模型绑定到图片档位
-- 小马 gpt-image-2: 文生图/图生图, async (is_async=1), 通过 /v1/media/generate + /v1/media/status 轮询
-- 小马 gemini-3-pro-image-preview (Nano Banana Pro): 文生图/图生图, async
-- 小马 gemini-3.1-flash-image-preview (Nano Banana 2): 文生图/图生图, async

-- 1. image_standard (文生图): 将小马 gpt-image-2 作为后备 (fallback_order=3)
SET @tier_std := (SELECT id FROM model_tiers WHERE tier_key = 'image_standard' AND status = 'active' LIMIT 1);
SET @m_gpt2 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE p.provider_key = 'xiaoma' AND m.name = 'gpt-image-2' AND m.deleted_at IS NULL LIMIT 1);
SET @m_nbp := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE p.provider_key = 'xiaoma' AND m.name = 'gemini-3-pro-image-preview' AND m.deleted_at IS NULL LIMIT 1);
SET @m_nb2 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE p.provider_key = 'xiaoma' AND m.name = 'gemini-3.1-flash-image-preview' AND m.deleted_at IS NULL LIMIT 1);

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_std, @m_gpt2, 'fallback', 3, 1, 1, 1
 WHERE @tier_std IS NOT NULL AND @m_gpt2 IS NOT NULL;

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_std, @m_nbp, 'fallback', 4, 1, 1, 1
 WHERE @tier_std IS NOT NULL AND @m_nbp IS NOT NULL;

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_std, @m_nb2, 'fallback', 5, 1, 1, 1
 WHERE @tier_std IS NOT NULL AND @m_nb2 IS NOT NULL;

-- 2. image_to_image_standard (图生图): 将小马 gpt-image-2 作为后备 (fallback_order=1)
SET @tier_i2i := (SELECT id FROM model_tiers WHERE tier_key = 'image_to_image_standard' AND status = 'active' LIMIT 1);

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_i2i, @m_gpt2, 'fallback', 1, 1, 1, 1
 WHERE @tier_i2i IS NOT NULL AND @m_gpt2 IS NOT NULL;

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_i2i, @m_nbp, 'fallback', 2, 1, 1, 1
 WHERE @tier_i2i IS NOT NULL AND @m_nbp IS NOT NULL;

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_i2i, @m_nb2, 'fallback', 3, 1, 1, 1
 WHERE @tier_i2i IS NOT NULL AND @m_nb2 IS NOT NULL;

-- 3. image_pro (专业生图): 将 xiaoma gpt-image-2-guan (官方) 作为后备
SET @tier_pro := (SELECT id FROM model_tiers WHERE tier_key = 'image_pro' AND status = 'active' LIMIT 1);
SET @m_gpt2o := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE p.provider_key = 'xiaoma' AND m.name = 'gpt-image-2-guan' AND m.deleted_at IS NULL LIMIT 1);

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_pro, @m_gpt2o, 'fallback', 2, 1, 1, 1
 WHERE @tier_pro IS NOT NULL AND @m_gpt2o IS NOT NULL;

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit)
SELECT @tier_pro, @m_nbp, 'fallback', 3, 1, 1, 1
 WHERE @tier_pro IS NOT NULL AND @m_nbp IS NOT NULL;
