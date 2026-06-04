-- ============================================================
-- Seed: Complete tier setup + model bindings for all 8 features
-- Uses numeric IDs to avoid collation issues
-- ============================================================

-- Feature IDs
SET @fi_img := (SELECT id FROM model_features WHERE feature_key='image_create' LIMIT 1);
SET @fi_i2i := (SELECT id FROM model_features WHERE feature_key='image_to_image' LIMIT 1);
SET @fi_edit := (SELECT id FROM model_features WHERE feature_key='image_edit' LIMIT 1);
SET @fi_vid := (SELECT id FROM model_features WHERE feature_key='video_create' LIMIT 1);
SET @fi_v2i := (SELECT id FROM model_features WHERE feature_key='image_to_video' LIMIT 1);
SET @fi_flf := (SELECT id FROM model_features WHERE feature_key='first_last_frame_video' LIMIT 1);
SET @fi_v_edit := (SELECT id FROM model_features WHERE feature_key='video_edit' LIMIT 1);
SET @fi_prompt := (SELECT id FROM model_features WHERE feature_key='prompt_optimize' LIMIT 1);

-- Model IDs (by name + provider)
SET @m_nano := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='NanoBanana' AND p.provider_key='bagege' AND m.deleted_at IS NULL LIMIT 1);
SET @m_gpt2 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='GPTImage2' AND p.provider_key='bagege' AND m.deleted_at IS NULL LIMIT 1);
SET @m_auto := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='auto' AND p.provider_key='codesonline_image' AND m.deleted_at IS NULL LIMIT 1);
SET @m_codex := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='gpt-image-2-codex' AND p.provider_key='codesonline_image' AND m.deleted_at IS NULL LIMIT 1);
SET @m_gpt2c := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='gpt-image-2' AND p.provider_key='codesonline_image' AND m.deleted_at IS NULL LIMIT 1);

SET @m_veo := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='Veo31Fast' AND p.provider_key='bagege' AND m.deleted_at IS NULL LIMIT 1);
SET @m_veofl := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='Veo31FastFL' AND p.provider_key='bagege' AND m.deleted_at IS NULL LIMIT 1);
SET @m_veoflhd := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='Veo31FastFLHD' AND p.provider_key='bagege' AND m.deleted_at IS NULL LIMIT 1);
SET @m_omni := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.name='OmniFlash10s' AND p.provider_key='bagege' AND m.deleted_at IS NULL LIMIT 1);

SET @m_x_t2v := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.api_model_name='happyhorse-t2v' AND p.provider_key='xiaoma' AND m.deleted_at IS NULL LIMIT 1);
SET @m_x_i2v := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.api_model_name='happyhorse-i2v' AND p.provider_key='xiaoma' AND m.deleted_at IS NULL LIMIT 1);
SET @m_x_dream := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.api_model_name='doubao-seedance-1-5-pro-251215' AND p.provider_key='xiaoma' AND m.deleted_at IS NULL LIMIT 1);
SET @m_x_veo := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.api_model_name='veo3.1' AND p.provider_key='xiaoma' AND m.deleted_at IS NULL LIMIT 1);
SET @m_x_edit := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id=m.provider_id WHERE m.api_model_name='happyhorse-video-edit' AND p.provider_key='xiaoma' AND m.deleted_at IS NULL LIMIT 1);

-- ===== 文生图 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, tag, points_cost, is_default, is_recommended, sort_order, quality_multipliers, status) VALUES
(@fi_img, '标准生图', 'standard', '日常生图，性价比之选', '推荐', 2, 1, 1, 1, '{"1K":1,"2K":2,"4K":4}', 'active'),
(@fi_img, '超清生图', 'pro', '高清画质，适合商业出图', '高清', 4, 0, 0, 2, '{"1K":2,"2K":3,"4K":6}', 'active');

SET @t_img_std := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_img LIMIT 1);
SET @t_img_pro := (SELECT id FROM model_tiers WHERE tier_key='pro' AND feature_id=@fi_img LIMIT 1);

INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_size_modes, native_sizes, default_ratio, allow_postprocess, postprocess_modes)
VALUES (@t_img_std, '["1:1","16:9","9:16","4:5","2:3","4:3","3:4"]', '["1K","2K"]', '["auto","ratio"]', '["1024x1024"]', '1:1', 1, '["cover","contain","resize"]'),
       (@t_img_pro, '["1:1","16:9","9:16","4:5","2:3","4:3","3:4"]', '["2K","4K"]', '["auto","ratio"]', '["2048x2048"]', '1:1', 1, '["cover","contain","resize"]');

INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_img_std, @m_nano, 'primary', 0), (@t_img_std, @m_auto, 'fallback', 1), (@t_img_std, @m_gpt2, 'fallback', 2),
(@t_img_pro, @m_codex, 'primary', 0), (@t_img_pro, @m_gpt2, 'fallback', 1);

-- ===== 图生图 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, points_cost, is_default, sort_order, status) VALUES
(@fi_i2i, '标准生图', 'standard', '上传参考图生成新图', 3, 1, 1, 'active');
SET @t_i2i := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_i2i LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_size_modes, native_sizes, default_ratio, allow_postprocess, max_images)
VALUES (@t_i2i, '["1:1","16:9","9:16","4:5","2:3"]', '["1K","2K"]', '["auto","ratio"]', '["1024x1024"]', '1:1', 1, 4);
INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_i2i, @m_gpt2, 'primary', 0), (@t_i2i, @m_gpt2c, 'fallback', 1);

-- ===== 图片编辑 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, points_cost, is_default, sort_order, status) VALUES
(@fi_edit, '标准编辑', 'standard', '上传图片进行局部修改', 3, 1, 1, 'active');
SET @t_edit := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_edit LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_size_modes, native_sizes, default_ratio, allow_postprocess, max_images)
VALUES (@t_edit, '["1:1","16:9","9:16"]', '["1K","2K"]', '["auto","ratio"]', '["1024x1024"]', '1:1', 1, 1);
INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_edit, @m_gpt2, 'primary', 0), (@t_edit, @m_auto, 'fallback', 1);

-- ===== 文生视频 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, tag, points_cost, is_default, is_recommended, sort_order, status) VALUES
(@fi_vid, '标准视频', 'standard', '日常视频生成', '推荐', 15, 1, 1, 1, 'active'),
(@fi_vid, '专业视频', 'pro', '高清长视频，商业级画质', '专业', 30, 0, 0, 2, 'active');
SET @t_vid_std := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_vid LIMIT 1);
SET @t_vid_pro := (SELECT id FROM model_tiers WHERE tier_key='pro' AND feature_id=@fi_vid LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_durations, supported_size_modes, default_ratio, max_duration_seconds)
VALUES (@t_vid_std, '["16:9","9:16","1:1"]', '["720p","1080p"]', '["4","8","12"]', '["auto","ratio"]', '16:9', 12),
       (@t_vid_pro, '["16:9","9:16","1:1","4:3","3:4"]', '["720p","1080p"]', '["4","8","12"]', '["auto","ratio"]', '16:9', 12);
INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_vid_std, @m_veo, 'primary', 0), (@t_vid_std, @m_x_t2v, 'fallback', 1),
(@t_vid_pro, @m_x_dream, 'primary', 0), (@t_vid_pro, @m_omni, 'fallback', 1);

-- ===== 图生视频 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, points_cost, is_default, sort_order, status) VALUES
(@fi_v2i, '标准视频', 'standard', '上传首帧图生成视频', 18, 1, 1, 'active');
SET @t_v2i := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_v2i LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_durations, supported_size_modes, default_ratio, max_duration_seconds, max_images)
VALUES (@t_v2i, '["16:9","9:16","1:1"]', '["720p","1080p"]', '["4","8","12"]', '["auto","ratio"]', '16:9', 12, 1);
INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_v2i, @m_veofl, 'primary', 0), (@t_v2i, @m_x_i2v, 'fallback', 1);

-- ===== 首尾帧视频 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, points_cost, is_default, sort_order, status) VALUES
(@fi_flf, '标准视频', 'standard', '上传首帧和尾帧图生成过渡视频', 25, 1, 1, 'active');
SET @t_flf := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_flf LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_durations, supported_size_modes, default_ratio, max_duration_seconds, max_images)
VALUES (@t_flf, '["16:9","9:16","1:1"]', '["720p","1080p"]', '["4","8","12"]', '["auto","ratio"]', '16:9', 12, 2);
INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_flf, @m_veoflhd, 'primary', 0), (@t_flf, @m_x_veo, 'fallback', 1);

-- ===== 视频编辑 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, points_cost, is_default, sort_order, status) VALUES
(@fi_v_edit, '标准编辑', 'standard', '上传视频进行编辑修改', 30, 1, 1, 'active');
SET @t_v_edit := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_v_edit LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_size_modes, default_ratio, max_duration_seconds)
VALUES (@t_v_edit, '["16:9","9:16","1:1"]', '["720p","1080p"]', '["auto","ratio"]', '16:9', 30);
INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES
(@t_v_edit, @m_x_edit, 'primary', 0);

-- ===== 提示词优化 =====
INSERT IGNORE INTO model_tiers (feature_id, tier_name, tier_key, description, points_cost, is_default, sort_order, status) VALUES
(@fi_prompt, '标准优化', 'standard', 'AI智能优化提示词', 1, 1, 1, 'active');
SET @t_prompt := (SELECT id FROM model_tiers WHERE tier_key='standard' AND feature_id=@fi_prompt LIMIT 1);
INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_size_modes, native_sizes, default_ratio)
VALUES (@t_prompt, '[]', '[]', '[]', '[]', '');
