-- Bind the first Xiaoma video launch batch to public mini-program tiers.
-- The migration only adds Xiaoma-specific tiers/bindings and keeps existing
-- WellAPI/APIMart/Bagege tiers intact. Existing user-edited tier keys are not reused.

SET @fi_vid := (SELECT id FROM model_features WHERE feature_key = 'video_create' LIMIT 1);
SET @fi_i2v := (SELECT id FROM model_features WHERE feature_key = 'image_to_video' LIMIT 1);
SET @fi_flf := (SELECT id FROM model_features WHERE feature_key = 'first_last_frame_video' LIMIT 1);
SET @fi_edit := (SELECT id FROM model_features WHERE feature_key = 'video_edit' LIMIT 1);

SET @m_sora2 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'sora-2' AND m.deleted_at IS NULL LIMIT 1);
SET @m_grok3 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'grok-video-3' AND m.deleted_at IS NULL LIMIT 1);
SET @m_grok_imagine := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'grok-imagine-video-1.5-preview' AND m.deleted_at IS NULL LIMIT 1);
SET @m_seedance := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'doubao-seedance-1-5-pro-251215' AND m.deleted_at IS NULL LIMIT 1);
SET @m_kling_video := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'kling-v3-video' AND m.deleted_at IS NULL LIMIT 1);
SET @m_kling_ref := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'kling-v3-omni-cankao' AND m.deleted_at IS NULL LIMIT 1);
SET @m_kling_flf := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'kling-v3-omni-shouweizhen' AND m.deleted_at IS NULL LIMIT 1);
SET @m_veo31 := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'veo3.1' AND m.deleted_at IS NULL LIMIT 1);
SET @m_veo31_4k := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'veo3.1-4k' AND m.deleted_at IS NULL LIMIT 1);
SET @m_veo31_lite := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'veo3.1-lite' AND m.deleted_at IS NULL LIMIT 1);
SET @m_omni := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'omni-flash' AND m.deleted_at IS NULL LIMIT 1);
SET @m_kw_flf := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'kwvideo-v2' AND m.deleted_at IS NULL LIMIT 1);
SET @m_kw_ref := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'kwvideo-v2-ref' AND m.deleted_at IS NULL LIMIT 1);
SET @m_kw_all_ref := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'kwvideo-v2-quannengcankao' AND m.deleted_at IS NULL LIMIT 1);
SET @m_happy_i2v := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'happyhorse-i2v' AND m.deleted_at IS NULL LIMIT 1);
SET @m_happy_edit := (SELECT m.id FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id WHERE (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma') AND m.api_model_name = 'happyhorse-video-edit' AND m.deleted_at IS NULL LIMIT 1);

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id AND p.deleted_at IS NULL
   SET m.config = JSON_SET(
         COALESCE(m.config, JSON_OBJECT()),
         '$.supported_ratios', JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),
         '$.supported_durations', JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),
         '$.supported_qualities', JSON_ARRAY('480p','720p','1080p'),
         '$.capabilities', JSON_ARRAY('image_to_video'),
         '$.supported_audio_modes', JSON_ARRAY('audio'),
         '$.default_audio_mode', 'audio',
         '$.supported_size_modes', JSON_ARRAY('ratio'),
         '$.input_mode', 'reference_images',
         '$.reference_upload_mode', 'reference_images',
         '$.min_reference_images', 1,
         '$.max_reference_images', 9,
         '$.default_params', JSON_OBJECT('version','standard','duration','auto','aspect_ratio','adaptive','resolution','720p')
       ),
       m.updated_at = NOW(3)
 WHERE m.deleted_at IS NULL
   AND (p.provider_key = 'xiaoma' OR p.provider_type = 'xiaoma')
   AND m.api_model_name = 'kwvideo-v2-quannengcankao';

DROP TEMPORARY TABLE IF EXISTS tmp_xiaoma_video_launch_tiers;
CREATE TEMPORARY TABLE tmp_xiaoma_video_launch_tiers (
  feature_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  tier_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  tier_name VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  tag VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  points_cost INT NOT NULL,
  pricing_mode VARCHAR(32) NOT NULL,
  pricing_rules JSON NULL,
  sort_order INT NOT NULL,
  model_id BIGINT UNSIGNED NULL,
  ratios JSON NOT NULL,
  qualities JSON NULL,
  durations JSON NULL,
  audio_modes JSON NULL,
  default_audio_mode VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'silent',
  default_ratio VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '16:9',
  max_reference_images INT NOT NULL DEFAULT 1,
  max_duration_seconds INT NOT NULL DEFAULT 30
) ENGINE=InnoDB;

INSERT INTO tmp_xiaoma_video_launch_tiers VALUES
('video_create','xiaoma_sora2_video','小马 Sora 2','Sora 2 文生视频/首图视频，小马 API。','Sora',12,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','4s'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','4s'),'pointsCost',12),JSON_OBJECT('conditions',JSON_OBJECT('duration','8s'),'pointsCost',24),JSON_OBJECT('conditions',JSON_OBJECT('duration','12s'),'pointsCost',36))),11,@m_sora2,JSON_ARRAY('16:9','9:16'),JSON_ARRAY(),JSON_ARRAY('4s','8s','12s'),NULL,'silent','16:9',1,12),
('video_create','xiaoma_grok3_video','小马 Grok Video 3','Grok Video 3 文生视频，小马 API。','Grok',18,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','6s','quality','720P'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','6s','quality','720p'),'pointsCost',18),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s','quality','720p'),'pointsCost',30),JSON_OBJECT('conditions',JSON_OBJECT('duration','6s','quality','1080p'),'pointsCost',26),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s','quality','1080p'),'pointsCost',42))),12,@m_grok3,JSON_ARRAY('2:3','3:2','1:1'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('6s','10s'),NULL,'silent','3:2',1,10),
('video_create','xiaoma_seedance_video','小马 即梦 Seedance','即梦 Seedance 文生视频/图生视频，小马 API。','即梦',32,'per_second_matrix',JSON_OBJECT('mode','per_second_matrix','defaultParams',JSON_OBJECT('duration','4s','quality','720p','audioMode','silent'),'defaultUnitPoints',8,'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('quality','480p'),'unitPoints',5),JSON_OBJECT('conditions',JSON_OBJECT('quality','720p'),'unitPoints',8),JSON_OBJECT('conditions',JSON_OBJECT('quality','1080p'),'unitPoints',16))),13,@m_seedance,JSON_ARRAY('adaptive','16:9','9:16','1:1','3:4','4:3'),JSON_ARRAY('480p','720p','1080p'),JSON_ARRAY('4s','8s','12s'),JSON_ARRAY('audio','silent'),'silent','16:9',2,12),
('video_create','xiaoma_kling_v3_video','小马 可灵 V3','可灵 V3 文生视频/图生视频/首尾帧，小马 API。','可灵',60,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','5s'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','5s'),'pointsCost',60),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s'),'pointsCost',120),JSON_OBJECT('conditions',JSON_OBJECT('duration','15s'),'pointsCost',180))),14,@m_kling_video,JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s','15s'),JSON_ARRAY('audio'),'audio','16:9',2,15),
('video_create','xiaoma_veo31_video','小马 Veo 3.1','Veo 3.1 固定 8 秒视频，小马 API。','Veo',35,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','8s','quality','1080p','generationMode','fast'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','8s','quality','1080p','generationMode','fast'),'pointsCost',35))),15,@m_veo31,JSON_ARRAY('9:16','16:9'),JSON_ARRAY('1080p'),JSON_ARRAY('8s'),NULL,'silent','16:9',2,8),
('video_create','xiaoma_veo31_lite_video','小马 Veo 3.1 Lite','Veo 3.1 Lite 视频，小马 API。','Veo',30,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('quality','sd'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('quality','sd'),'pointsCost',30),JSON_OBJECT('conditions',JSON_OBJECT('quality','4k'),'pointsCost',90))),16,@m_veo31_lite,JSON_ARRAY('9:16','16:9'),JSON_ARRAY('sd','4k'),JSON_ARRAY(),NULL,'silent','16:9',2,30),
('video_create','xiaoma_omni_flash_video','小马 Omni Flash','Omni Flash 固定按次视频，小马 API。','Omni',60,'fixed',NULL,17,@m_omni,JSON_ARRAY('16:9','9:16'),JSON_ARRAY(),JSON_ARRAY('6s','8s','10s'),JSON_ARRAY('audio'),'audio','16:9',3,10),
('image_to_video','xiaoma_sora2_i2v','小马 Sora 2 首图','Sora 2 单首图图生视频，小马 API。','Sora',14,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','4s'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','4s'),'pointsCost',14),JSON_OBJECT('conditions',JSON_OBJECT('duration','8s'),'pointsCost',28),JSON_OBJECT('conditions',JSON_OBJECT('duration','12s'),'pointsCost',42))),11,@m_sora2,JSON_ARRAY('16:9','9:16'),JSON_ARRAY(),JSON_ARRAY('4s','8s','12s'),NULL,'silent','16:9',1,12),
('image_to_video','xiaoma_grok3_i2v','小马 Grok Video 3 首图','Grok Video 3 单首图图生视频，小马 API。','Grok',20,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','6s','quality','720P'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','6s','quality','720p'),'pointsCost',20),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s','quality','720p'),'pointsCost',32),JSON_OBJECT('conditions',JSON_OBJECT('duration','6s','quality','1080p'),'pointsCost',28),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s','quality','1080p'),'pointsCost',45))),12,@m_grok3,JSON_ARRAY('2:3','3:2','1:1'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('6s','10s'),NULL,'silent','3:2',1,10),
('image_to_video','xiaoma_grok_imagine_i2v','小马 Grok Imagine 首图','Grok Imagine 1.5 单首图图生视频，小马 API。','Grok',25,'per_second_matrix',JSON_OBJECT('mode','per_second_matrix','defaultParams',JSON_OBJECT('duration','5s','quality','720p','audioMode','audio'),'defaultUnitPoints',5,'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('quality','480p'),'unitPoints',4),JSON_OBJECT('conditions',JSON_OBJECT('quality','720p'),'unitPoints',5))),13,@m_grok_imagine,JSON_ARRAY('16:9','9:16','1:1','3:2','2:3'),JSON_ARRAY('720p','480p'),JSON_ARRAY('1s','2s','3s','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio','16:9',1,15),
('image_to_video','xiaoma_kling_reference','小马 可灵 V3 参考生','可灵 V3 Omni 多参考图生视频，小马 API。','可灵',55,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','5s'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','5s'),'pointsCost',55),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s'),'pointsCost',110),JSON_OBJECT('conditions',JSON_OBJECT('duration','15s'),'pointsCost',165))),21,@m_kling_ref,JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s','15s'),JSON_ARRAY('audio'),'audio','16:9',7,15),
('image_to_video','xiaoma_omni_flash_reference','小马 Omni Flash 参考生','Omni Flash 多参考图生视频，小马 API。','Omni',60,'fixed',NULL,22,@m_omni,JSON_ARRAY('16:9','9:16'),JSON_ARRAY(),JSON_ARRAY('6s','8s','10s'),JSON_ARRAY('audio'),'audio','16:9',3,10),
('image_to_video','xiaoma_sd20_reference','小马 SD 2.0 参考生','SD 2.0 多参考图生视频，token 预扣。','SD2.0',80,'token_preauth',JSON_OBJECT('mode','token_preauth','preauthPoints',80,'settlement','manual_later'),23,@m_kw_ref,JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),JSON_ARRAY('480p','720p'),JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio','adaptive',9,15),
('image_to_video','xiaoma_sd20_all_reference','小马 SD 2.0 全能参考','SD 2.0 全能参考生视频，token 预扣。','SD2.0',100,'token_preauth',JSON_OBJECT('mode','token_preauth','preauthPoints',100,'settlement','manual_later'),24,@m_kw_all_ref,JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),JSON_ARRAY('480p','720p','1080p'),JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio','adaptive',9,15),
('first_last_frame_video','xiaoma_seedance_first_last','小马 即梦首尾帧','即梦 Seedance 首尾帧视频，小马 API。','即梦',32,'per_second_matrix',JSON_OBJECT('mode','per_second_matrix','defaultParams',JSON_OBJECT('duration','4s','quality','720p','audioMode','silent'),'defaultUnitPoints',8,'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('quality','480p'),'unitPoints',5),JSON_OBJECT('conditions',JSON_OBJECT('quality','720p'),'unitPoints',8),JSON_OBJECT('conditions',JSON_OBJECT('quality','1080p'),'unitPoints',16))),11,@m_seedance,JSON_ARRAY('adaptive','16:9','9:16','1:1','3:4','4:3'),JSON_ARRAY('480p','720p','1080p'),JSON_ARRAY('4s','8s','12s'),JSON_ARRAY('audio','silent'),'silent','16:9',2,12),
('first_last_frame_video','xiaoma_kling_first_last','小马 可灵 V3 首尾帧','可灵 V3/Omni 首尾帧视频，小马 API。','可灵',55,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','5s'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','5s'),'pointsCost',55),JSON_OBJECT('conditions',JSON_OBJECT('duration','10s'),'pointsCost',110),JSON_OBJECT('conditions',JSON_OBJECT('duration','15s'),'pointsCost',165))),12,@m_kling_flf,JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY(),JSON_ARRAY('5s','10s','15s'),JSON_ARRAY('audio'),'audio','16:9',2,15),
('first_last_frame_video','xiaoma_veo31_first_last','小马 Veo 3.1 首尾帧','Veo 3.1 固定 8 秒首尾帧，小马 API。','Veo',35,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','8s','quality','1080p','generationMode','fast'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','8s','quality','1080p','generationMode','fast'),'pointsCost',35))),13,@m_veo31,JSON_ARRAY('9:16','16:9'),JSON_ARRAY('1080p'),JSON_ARRAY('8s'),NULL,'silent','16:9',2,8),
('first_last_frame_video','xiaoma_veo31_4k_first_last','小马 Veo 3.1 4K 首尾帧','Veo 3.1 4K 固定 8 秒首尾帧，小马 API。','4K',150,'matrix',JSON_OBJECT('mode','matrix','defaultParams',JSON_OBJECT('duration','8s','quality','4k','generationMode','fast'),'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('duration','8s','quality','4k','generationMode','fast'),'pointsCost',150))),14,@m_veo31_4k,JSON_ARRAY('9:16','16:9'),JSON_ARRAY('4k'),JSON_ARRAY('8s'),NULL,'silent','16:9',2,8),
('first_last_frame_video','xiaoma_sd20_first_last','小马 SD 2.0 首尾帧','SD 2.0 首尾帧视频，token 预扣。','SD2.0',80,'token_preauth',JSON_OBJECT('mode','token_preauth','preauthPoints',80,'settlement','manual_later'),15,@m_kw_flf,JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9'),JSON_ARRAY('480p','720p'),JSON_ARRAY('auto','4s','5s','6s','7s','8s','9s','10s','11s','12s','13s','14s','15s'),JSON_ARRAY('audio'),'audio','adaptive',2,15),
('video_edit','xiaoma_happyhorse_video_edit','小马 HappyHorse 视频编辑','HappyHorse 视频编辑，小马 API。','编辑',30,'per_second_matrix',JSON_OBJECT('mode','per_second_matrix','defaultParams',JSON_OBJECT('duration','5s','quality','720P'),'defaultUnitPoints',8,'rules',JSON_ARRAY(JSON_OBJECT('conditions',JSON_OBJECT('quality','720p'),'unitPoints',8),JSON_OBJECT('conditions',JSON_OBJECT('quality','1080p'),'unitPoints',14))),11,@m_happy_edit,JSON_ARRAY('16:9','9:16','1:1'),JSON_ARRAY('720P','1080P'),JSON_ARRAY('4s','5s','6s','7s','8s','9s','10s'),NULL,'silent','16:9',1,10);

INSERT INTO model_tiers
  (feature_id, tier_name, tier_key, description, tag, points_cost, pricing_mode, pricing_rules, is_default, is_recommended, sort_order, status)
SELECT f.id, x.tier_name, x.tier_key, x.description, x.tag, x.points_cost, x.pricing_mode, x.pricing_rules, 0, 0, x.sort_order, 'active'
  FROM tmp_xiaoma_video_launch_tiers x
  JOIN model_features f ON f.feature_key = x.feature_key COLLATE utf8mb4_unicode_ci
 WHERE x.model_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  tier_name = VALUES(tier_name),
  description = VALUES(description),
  tag = VALUES(tag),
  points_cost = VALUES(points_cost),
  pricing_mode = VALUES(pricing_mode),
  pricing_rules = VALUES(pricing_rules),
  sort_order = VALUES(sort_order),
  status = 'active',
  updated_at = NOW(3);

INSERT INTO tier_capabilities
  (tier_id, supported_ratios, supported_qualities, supported_durations, supported_audio_modes, default_audio_mode, supported_size_modes, native_sizes, default_ratio, allow_postprocess, postprocess_modes, max_images, max_reference_images, max_duration_seconds)
SELECT t.id, x.ratios, COALESCE(x.qualities, JSON_ARRAY()), x.durations, x.audio_modes, x.default_audio_mode, JSON_ARRAY('ratio'), JSON_ARRAY(), x.default_ratio, 0, JSON_ARRAY(), x.max_reference_images, x.max_reference_images, x.max_duration_seconds
  FROM tmp_xiaoma_video_launch_tiers x
  JOIN model_tiers t ON t.tier_key = x.tier_key COLLATE utf8mb4_unicode_ci
 WHERE x.model_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  supported_ratios = VALUES(supported_ratios),
  supported_qualities = VALUES(supported_qualities),
  supported_durations = VALUES(supported_durations),
  supported_audio_modes = VALUES(supported_audio_modes),
  default_audio_mode = VALUES(default_audio_mode),
  supported_size_modes = VALUES(supported_size_modes),
  default_ratio = VALUES(default_ratio),
  max_images = VALUES(max_images),
  max_reference_images = VALUES(max_reference_images),
  max_duration_seconds = VALUES(max_duration_seconds),
  updated_at = NOW(3);

INSERT INTO tier_model_bindings
  (tier_id, model_id, binding_type, fallback_order)
SELECT t.id, x.model_id, 'primary', 0
  FROM tmp_xiaoma_video_launch_tiers x
  JOIN model_tiers t ON t.tier_key = x.tier_key COLLATE utf8mb4_unicode_ci
 WHERE x.model_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  binding_type = VALUES(binding_type),
  fallback_order = VALUES(fallback_order);

INSERT INTO tier_model_bindings
  (tier_id, model_id, binding_type, fallback_order)
SELECT t.id, x.model_id, 'fallback', x.fallback_order
  FROM (
    SELECT 'video_standard' AS tier_key, @m_sora2 AS model_id, 10 AS fallback_order
    UNION ALL SELECT 'video_pro', @m_seedance, 10
    UNION ALL SELECT 'video_top', @m_veo31, 10
    UNION ALL SELECT 'image_to_video_standard', @m_happy_i2v, 10
    UNION ALL SELECT 'image_to_video_standard', @m_sora2, 11
    UNION ALL SELECT 'image_to_video_standard', @m_grok3, 12
    UNION ALL SELECT 'first_last_frame_standard', @m_veo31, 10
    UNION ALL SELECT 'first_last_frame_standard', @m_kling_flf, 11
    UNION ALL SELECT 'video_edit_standard', @m_happy_edit, 10
  ) x
  JOIN model_tiers t ON t.tier_key = x.tier_key COLLATE utf8mb4_unicode_ci
 WHERE x.model_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  fallback_order = LEAST(tier_model_bindings.fallback_order, VALUES(fallback_order));

DROP TEMPORARY TABLE IF EXISTS tmp_xiaoma_video_launch_tiers;
