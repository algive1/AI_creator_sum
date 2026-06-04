CREATE TABLE IF NOT EXISTS template_tags (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  tag_name VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_template_tag (template_id, tag_name),
  INDEX idx_tag (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @inspiration_templates_exists := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates'
);

SET @duration_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'duration'
);
SET @sql := IF(@inspiration_templates_exists > 0 AND @duration_exists = 0,
  'ALTER TABLE inspiration_templates ADD COLUMN duration VARCHAR(8) NOT NULL DEFAULT '''' COMMENT ''Legacy video template duration''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_template_type_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND index_name = 'idx_template_type'
);
SET @sql := IF(@inspiration_templates_exists > 0 AND @idx_template_type_exists = 0,
  'ALTER TABLE inspiration_templates ADD INDEX idx_template_type (template_type)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_title := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'title');
SET @has_name := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'name');
SET @has_description := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'description');
SET @has_template_type := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'template_type');
SET @has_type := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'type');
SET @has_cover_url := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'cover_url');
SET @has_cover_image := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'cover_image');
SET @has_prompt_template := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'prompt_template');
SET @has_prompt := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'prompt');
SET @has_negative_prompt := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'negative_prompt');
SET @has_default_params := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'default_params');
SET @has_ratio := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'ratio');
SET @has_style := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'style');
SET @has_quality := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'quality');
SET @has_scene := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'scene');
SET @has_category_id := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'category_id');
SET @has_tags := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'tags');
SET @has_sort_order := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'sort_order');
SET @has_is_recommended := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'is_recommended');
SET @has_is_hot := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'is_hot');
SET @has_status := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'status');
SET @has_usage_count := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'usage_count');
SET @has_favorites_count := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'favorites_count');
SET @has_favorite_count := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'favorite_count');
SET @has_membership_only := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'membership_only');
SET @has_membership_min_level := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'membership_min_level');
SET @has_created_at := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'created_at');
SET @has_updated_at := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'updated_at');
SET @has_deleted_at := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inspiration_templates' AND column_name = 'deleted_at');

SET @title_expr := IF(@has_title > 0, 'COALESCE(it.title, '''')', IF(@has_name > 0, 'COALESCE(it.name, '''')', ''''''));
SET @description_expr := IF(@has_description > 0, 'COALESCE(it.description, '''')', '''''');
SET @type_expr := IF(@has_template_type > 0, 'COALESCE(it.template_type, ''image'')', IF(@has_type > 0, 'COALESCE(it.type, ''image'')', '''image'''));
SET @cover_expr := IF(@has_cover_url > 0, 'COALESCE(it.cover_url, '''')', IF(@has_cover_image > 0, 'COALESCE(it.cover_image, '''')', ''''''));
SET @prompt_expr := IF(@has_prompt_template > 0, 'COALESCE(it.prompt_template, '''')', IF(@has_prompt > 0, 'COALESCE(it.prompt, '''')', ''''''));
SET @negative_expr := IF(@has_negative_prompt > 0, 'COALESCE(it.negative_prompt, '''')', '''''');
SET @ratio_expr := IF(@has_ratio > 0, 'COALESCE(it.ratio, '''')', IF(@has_default_params > 0, 'COALESCE(JSON_UNQUOTE(JSON_EXTRACT(it.default_params, ''$.ratio'')), '''')', ''''''));
SET @style_expr := IF(@has_style > 0, 'COALESCE(it.style, '''')', IF(@has_default_params > 0, 'COALESCE(JSON_UNQUOTE(JSON_EXTRACT(it.default_params, ''$.style'')), '''')', ''''''));
SET @quality_expr := IF(@has_quality > 0, 'COALESCE(it.quality, '''')', IF(@has_default_params > 0, 'COALESCE(JSON_UNQUOTE(JSON_EXTRACT(it.default_params, ''$.quality'')), '''')', ''''''));
SET @params_expr := IF(@has_default_params > 0, 'COALESCE(it.default_params, JSON_OBJECT())', CONCAT('JSON_OBJECT(''ratio'', ', @ratio_expr, ', ''style'', ', @style_expr, ', ''quality'', ', @quality_expr, ')'));
SET @duration_expr := IF(@duration_exists > 0, 'CAST(NULLIF(REPLACE(LOWER(COALESCE(it.duration, '''')), ''s'', ''''), '''') AS UNSIGNED)', 'NULL');
SET @scene_expr := IF(@has_scene > 0, 'COALESCE(it.scene, '''')', '''''');
SET @category_expr := IF(@has_category_id > 0, 'it.category_id', 'NULL');
SET @tag_expr := IF(@has_tags > 0, 'COALESCE(it.tags, '''')', '''''');
SET @tags_expr := IF(@has_tags > 0,
  CONCAT('CASE WHEN ', @tag_expr, ' = '''' THEN COALESCE((SELECT JSON_ARRAYAGG(tt.tag_name) FROM template_tags tt WHERE tt.template_id = it.id), JSON_ARRAY()) ELSE JSON_ARRAY(', @tag_expr, ') END'),
  'COALESCE((SELECT JSON_ARRAYAGG(tt.tag_name) FROM template_tags tt WHERE tt.template_id = it.id), JSON_ARRAY())'
);
SET @sort_expr := IF(@has_sort_order > 0, 'COALESCE(it.sort_order, 0)', '0');
SET @recommended_expr := IF(@has_is_recommended > 0, 'COALESCE(it.is_recommended, 0)', '0');
SET @hot_expr := IF(@has_is_hot > 0, 'COALESCE(it.is_hot, 0)', '0');
SET @status_expr := IF(@has_status > 0, 'COALESCE(it.status, ''active'')', '''active''');
SET @usage_expr := IF(@has_usage_count > 0, 'COALESCE(it.usage_count, 0)', '0');
SET @favorite_expr := IF(@has_favorites_count > 0, 'COALESCE(it.favorites_count, 0)', IF(@has_favorite_count > 0, 'COALESCE(it.favorite_count, 0)', '0'));
SET @member_only_expr := IF(@has_membership_only > 0, 'COALESCE(it.membership_only, 0)', '0');
SET @member_level_expr := IF(@has_membership_min_level > 0, 'COALESCE(it.membership_min_level, '''')', '''''');
SET @created_expr := IF(@has_created_at > 0, 'COALESCE(it.created_at, NOW(3))', 'NOW(3)');
SET @updated_expr := IF(@has_updated_at > 0, 'COALESCE(it.updated_at, NOW(3))', 'NOW(3)');
SET @deleted_expr := IF(@has_deleted_at > 0, 'it.deleted_at', 'NULL');

SET @sql := IF(@inspiration_templates_exists > 0,
  CONCAT(
    'INSERT INTO templates (id, title, description, template_type, target_feature, source, user_id, task_id, output_id, cover_file_id, cover_url, preview_file_id, preview_url, prompt, negative_prompt, params_json, ratio, width, height, duration, style, scene, category_id, tags_json, sort_order, is_recommended, is_hot, is_enabled, visibility, status, review_status, review_reason, usage_count, view_count, favorite_count, access_level, visibility_scope, usage_scope, required_member_plan_id, member_badge_text, member_lock_message, created_at, updated_at, deleted_at) ',
    'SELECT it.id, ', @title_expr, ', ', @description_expr, ', ',
    'CASE WHEN ', @type_expr, ' IN (''image'', ''video'', ''manga'', ''inspiration'') THEN ', @type_expr, ' ELSE ''image'' END, ',
    'CASE WHEN ', @type_expr, ' = ''video'' THEN ''video_create'' WHEN ', @type_expr, ' = ''manga'' THEN ''comic_create'' WHEN ', @type_expr, ' = ''inspiration'' THEN ''inspiration'' ELSE ''image_create'' END, ',
    '''official'', NULL, NULL, NULL, NULL, ', @cover_expr, ', NULL, ', @cover_expr, ', ', @prompt_expr, ', ', @negative_expr, ', ', @params_expr, ', ',
    @ratio_expr, ', 0, 0, ', @duration_expr, ', ', @style_expr, ', ', @scene_expr, ', ', @category_expr, ', ', @tags_expr, ', ', @sort_expr, ', ',
    @recommended_expr, ', ', @hot_expr, ', CASE WHEN ', @status_expr, ' = ''active'' THEN 1 ELSE 0 END, ''public'', ',
    'CASE WHEN ', @status_expr, ' = ''active'' THEN ''approved'' WHEN ', @status_expr, ' = ''draft'' THEN ''draft'' WHEN ', @status_expr, ' = ''inactive'' THEN ''offline'' ELSE ', @status_expr, ' END, ',
    'CASE WHEN ', @status_expr, ' = ''active'' THEN ''approved'' ELSE ''pending'' END, '''', ', @usage_expr, ', 0, ', @favorite_expr, ', ',
    'CASE WHEN ', @member_only_expr, ' = 1 THEN ''member'' ELSE ''free'' END, ''all'', CASE WHEN ', @member_only_expr, ' = 1 THEN ''member'' ELSE ''all'' END, NULL, ',
    @member_level_expr, ', '''', ', @created_expr, ', ', @updated_expr, ', ', @deleted_expr, ' ',
    'FROM inspiration_templates it ',
    'WHERE NOT EXISTS (SELECT 1 FROM templates t WHERE t.id = it.id) ',
    'AND NOT EXISTS (SELECT 1 FROM templates t WHERE t.source = ''official'' AND t.title = ', @title_expr, ' AND t.prompt = ', @prompt_expr, ')'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO template_tag_relations (template_id, tag_name, created_at)
SELECT tt.template_id, tt.tag_name, tt.created_at
FROM template_tags tt
JOIN templates t ON t.id = tt.template_id AND t.source = 'official';
