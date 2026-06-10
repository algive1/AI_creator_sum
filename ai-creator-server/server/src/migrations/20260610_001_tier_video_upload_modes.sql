-- Add per-tier video upload mode overrides for admin feature configuration.
-- NULL keeps the old model-config inference path; saved values override inference.

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'input_mode'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN input_mode VARCHAR(32) NULL COMMENT ''video input mode override'' AFTER max_reference_images',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'reference_upload_mode'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN reference_upload_mode VARCHAR(32) NULL COMMENT ''video upload mode override'' AFTER input_mode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'min_reference_images'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN min_reference_images INT NULL COMMENT ''minimum required reference assets'' AFTER reference_upload_mode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'tier_capabilities' AND column_name = 'required_reference'
);
SET @sql := IF(@column_exists = 0,
  'ALTER TABLE tier_capabilities ADD COLUMN required_reference TINYINT(1) NULL COMMENT ''whether reference asset is required'' AFTER min_reference_images',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE tier_capabilities c
JOIN model_tiers t ON t.id = c.tier_id
JOIN model_features f ON f.id = t.feature_id
   SET c.input_mode = COALESCE(c.input_mode,
       CASE
         WHEN f.feature_key = 'video_create' THEN 'text'
         WHEN f.feature_key = 'image_to_video' AND (t.tier_key LIKE '%reference%' OR t.tier_key LIKE '%cankao%' OR t.tier_name LIKE '%参考%') THEN 'reference_images'
         WHEN f.feature_key = 'image_to_video' THEN 'first_frame'
         WHEN f.feature_key = 'first_last_frame_video' THEN 'first_last'
         WHEN f.feature_key = 'video_edit' THEN 'source_video'
         ELSE NULL
       END),
       c.reference_upload_mode = COALESCE(c.reference_upload_mode,
       CASE
         WHEN f.feature_key = 'video_create' THEN 'none'
         WHEN f.feature_key = 'image_to_video' AND (t.tier_key LIKE '%reference%' OR t.tier_key LIKE '%cankao%' OR t.tier_name LIKE '%参考%') THEN 'reference_images'
         WHEN f.feature_key = 'image_to_video' THEN 'first_frame'
         WHEN f.feature_key = 'first_last_frame_video' THEN 'first_last'
         WHEN f.feature_key = 'video_edit' THEN 'source_video'
         ELSE NULL
       END),
       c.min_reference_images = COALESCE(c.min_reference_images,
       CASE
         WHEN f.feature_key = 'video_create' THEN 0
         WHEN f.feature_key = 'image_to_video' THEN 1
         WHEN f.feature_key = 'first_last_frame_video' THEN 2
         WHEN f.feature_key = 'video_edit' THEN 1
         ELSE NULL
       END),
       c.required_reference = COALESCE(c.required_reference,
       CASE
         WHEN f.feature_key IN ('image_to_video', 'first_last_frame_video', 'video_edit') THEN 1
         WHEN f.feature_key = 'video_create' THEN 0
         ELSE NULL
       END)
 WHERE f.feature_key IN ('video_create', 'image_to_video', 'first_last_frame_video', 'video_edit');
