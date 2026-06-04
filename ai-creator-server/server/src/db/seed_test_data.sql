-- ============================================================
-- 测试种子数据
-- ============================================================
SET NAMES utf8mb4;

-- ===== 1. 测试用户 =====
INSERT IGNORE INTO users (id, nickname, avatar_url, openid, phone, status, created_at, last_login_at) VALUES
(10001, '陈小明', '', 'dev_openid_10001', '13800001001', 'normal', '2026-05-20 08:00:00.000', '2026-05-29 09:30:00.000'),
(10002, '李小红', '', 'dev_openid_10002', '13800001002', 'normal', '2026-05-21 10:00:00.000', '2026-05-28 14:00:00.000'),
(10003, '王大锤', '', 'dev_openid_10003', '13800001003', 'normal', '2026-05-22 12:00:00.000', '2026-05-29 08:00:00.000'),
(10004, '赵四', '', 'dev_openid_10004', '13800001004', 'banned', '2026-05-18 09:00:00.000', '2026-05-25 10:00:00.000'),
(10005, '孙小美', '', 'dev_openid_10005', '13800001005', 'normal', '2026-05-23 16:00:00.000', '2026-05-29 10:00:00.000');

-- ===== 2. 积分账户 =====
INSERT INTO point_accounts (user_id, balance, total_earned, total_spent, version, created_at, updated_at) VALUES
(10001, 580, 800, 220, 1, NOW(3), NOW(3)),
(10002, 120, 300, 180, 1, NOW(3), NOW(3)),
(10003, 2000, 2500, 500, 1, NOW(3), NOW(3)),
(10004, 50, 100, 50, 1, NOW(3), NOW(3)),
(10005, 3500, 5000, 1500, 1, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE balance=VALUES(balance), total_earned=VALUES(total_earned), total_spent=VALUES(total_spent);

-- ===== 3. 用户资产 =====
INSERT INTO user_assets (user_id, points_balance, total_points_earned, total_points_spent, membership_level, membership_expire_at, created_at, updated_at) VALUES
(10001, 580, 800, 220, 'pro', '2026-07-20 08:00:00.000', NOW(3), NOW(3)),
(10002, 120, 300, 180, 'free', NULL, NOW(3), NOW(3)),
(10003, 2000, 2500, 500, 'business', '2026-08-22 12:00:00.000', NOW(3), NOW(3)),
(10004, 50, 100, 50, 'free', NULL, NOW(3), NOW(3)),
(10005, 3500, 5000, 1500, 'pro', '2026-06-23 16:00:00.000', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE membership_level=VALUES(membership_level), membership_expire_at=VALUES(membership_expire_at);

-- ===== 4. AI 任务 =====
INSERT IGNORE INTO ai_tasks (id, task_no, user_id, task_type, sub_type, title, status, progress, points_cost, points_refunded, tier_id, actual_model_id, audit_status, created_at, completed_at, failed_at) VALUES
(2001, 'IMG-20260529-00001', 10001, 'image', 'text2img', '一只可爱的橘猫在窗台上晒太阳', 'completed', 100, 4, 0, 1, 1, 'passed', '2026-05-29 09:00:00.000', '2026-05-29 09:02:00.000', NULL),
(2002, 'IMG-20260529-00002', 10002, 'image', 'text2img', '赛博朋克风格的城市夜景', 'completed', 100, 6, 0, 2, 2, 'passed', '2026-05-29 09:10:00.000', '2026-05-29 09:13:00.000', NULL),
(2003, 'IMG-20260529-00003', 10003, 'image', 'img2img', '把产品图换成白色背景', 'completed', 100, 4, 0, 1, 1, 'passed', '2026-05-29 09:20:00.000', '2026-05-29 09:25:00.000', NULL),
(2004, 'VID-20260529-00001', 10001, 'video', 'text_to_video', '海浪拍打岩石的慢动作', 'completed', 100, 20, 0, 5, 6, 'passed', '2026-05-29 08:00:00.000', '2026-05-29 08:15:00.000', NULL),
(2005, 'IMG-20260529-00005', 10005, 'image', 'text2img', '一个现代简约风格的客厅', 'processing', 50, 4, 0, 1, 1, NULL, '2026-05-29 10:00:00.000', NULL, NULL),
(2006, 'IMG-20260529-00006', 10005, 'image', 'edit', '去除图片中的水印', 'queued', 0, 2, 0, 3, 4, NULL, '2026-05-29 10:05:00.000', NULL, NULL),
(2007, 'VID-20260529-00002', 10003, 'video', 'image_to_video', '让静态风景照动起来', 'failed', 10, 30, 30, 5, 6, NULL, '2026-05-29 07:00:00.000', NULL, '2026-05-29 07:10:00.000'),
(2008, 'IMG-20260529-00008', 10002, 'image', 'text2img', '测试敏感词任务', 'completed', 100, 2, 0, 1, 1, 'pending', '2026-05-29 10:30:00.000', '2026-05-29 10:32:00.000', NULL);

-- ===== 5. 任务输入 =====
INSERT IGNORE INTO ai_task_inputs (task_id, prompt, params, form_data, system_prompt, negative_prompt, created_at) VALUES
(2001, '一只可爱的橘猫在窗台上晒太阳', '{"ratio":"1:1","quality":"2K","style":"写实"}', '{"brand":"","scene":"日常"}', '', '', '2026-05-29 09:00:00.000'),
(2002, '赛博朋克风格的城市夜景，霓虹灯，下雨天', '{"ratio":"16:9","quality":"4K","style":"赛博朋克"}', '{"brand":"","scene":"艺术创作"}', '', '', '2026-05-29 09:10:00.000'),
(2004, '海浪拍打岩石的慢动作，4K画质', '{"duration":"5s","ratio":"16:9","resolution":"1080p"}', '{}', '', '', '2026-05-29 08:00:00.000'),
(2005, '一个现代简约风格的客厅，北欧风', '{"ratio":"1:1","quality":"1K"}', '{"brand":"宜家","scene":"家居展示"}', '', '', '2026-05-29 10:00:00.000');

-- ===== 6. 任务输出 =====
INSERT IGNORE INTO ai_task_outputs (task_id, output_index, output_name, title, subtitle, output_type, cos_key, thumbnail_key, ratio, style, width, height, file_size, metadata, created_at) VALUES
(2001, 0, 'output_1', '橘猫晒太阳', '', 'image', 'output/2001_0.png', 'thumb/2001_0.png', '1:1', '写实', 1024, 1024, 204800, '{}', '2026-05-29 09:02:00.000'),
(2002, 0, 'output_2', '赛博朋克城市', '', 'image', 'output/2002_0.png', 'thumb/2002_0.png', '16:9', '赛博朋克', 1920, 1080, 512000, '{}', '2026-05-29 09:13:00.000'),
(2004, 0, 'output_3', '海浪慢动作', '', 'video', 'output/2004_0.mp4', 'thumb/2004_0.png', '16:9', '', 1920, 1080, 1048576, '{"duration":5}', '2026-05-29 08:15:00.000');

-- ===== 7. 审核日志 =====
INSERT IGNORE INTO audit_logs (task_id, audit_type, audit_result, risk_level, risk_label, reviewed_by, reviewed_at, created_at) VALUES
(2008, 'text', 'pending', 'medium', '疑似敏感内容', NULL, NULL, '2026-05-29 10:30:00.000'),
(2001, 'image', 'pass', 'low', NULL, 1, '2026-05-29 09:02:00.000', '2026-05-29 09:02:00.000'),
(2002, 'image', 'pass', 'low', NULL, 1, '2026-05-29 09:13:00.000', '2026-05-29 09:13:00.000');

-- ===== 8. 订单 =====
INSERT IGNORE INTO member_orders (id, order_no, user_id, order_type, product_id, product_name, amount_total, currency, points_amount, member_plan_id, member_duration_days, plan_id, subject, amount, paid_amount, status, pay_status, pay_channel, grant_status, grant_message, paid_at, expire_at, created_at, updated_at) VALUES
(1001, 'SEED20260529001', 10001, 'points', 1, '新手包(100积分)', 999, 'CNY', 100, NULL, 0, NULL, '积分充值-新手包', 999, 999, 'paid', 'paid', 'wechat_jsapi', 'granted', '', '2026-05-20 08:05:00.000', '2026-05-20 08:35:00.000', '2026-05-20 08:00:00.000', '2026-05-20 08:05:00.000'),
(1002, 'SEED20260529002', 10002, 'points', 2, '进阶包(300积分)', 1999, 'CNY', 300, NULL, 0, NULL, '积分充值-进阶包', 1999, 1999, 'paid', 'paid', 'wechat_jsapi', 'granted', '', '2026-05-21 10:05:00.000', '2026-05-21 10:35:00.000', '2026-05-21 10:00:00.000', '2026-05-21 10:05:00.000'),
(1003, 'SEED20260529003', 10003, 'membership', NULL, '专业版月卡', 2900, 'CNY', NULL, 1, 30, 1, '会员购买-专业版月卡', 2900, 2900, 'paid', 'paid', 'wechat_jsapi', 'granted', '', '2026-05-22 12:05:00.000', '2026-05-22 12:35:00.000', '2026-05-22 12:00:00.000', '2026-05-22 12:05:00.000'),
(1004, 'SEED20260529004', 10005, 'membership', NULL, '专业版月卡', 2900, 'CNY', NULL, 1, 30, 1, '会员购买-专业版月卡', 2900, 2900, 'paid', 'paid', 'wechat_jsapi', 'granted', '', '2026-05-23 16:05:00.000', '2026-05-23 16:35:00.000', '2026-05-23 16:00:00.000', '2026-05-23 16:05:00.000'),
(1005, 'SEED20260529005', 10002, 'membership', NULL, '专业版月卡', 2900, 'CNY', NULL, 1, 30, 1, '会员购买-专业版月卡', 2900, 0, 'created', 'unpaid', 'wechat_jsapi', 'pending', '', NULL, '2026-05-29 11:00:00.000', '2026-05-29 10:00:00.000', '2026-05-29 10:00:00.000'),
(1006, 'SEED20260529006', 10003, 'points', 3, '大师包(1000积分)', 6999, 'CNY', 1000, NULL, 0, NULL, '积分充值-大师包', 6999, 6999, 'paid', 'paid', 'wechat_jsapi', 'failed', '积分发放失败，请联系客服', '2026-05-28 10:05:00.000', '2026-05-28 10:35:00.000', '2026-05-28 10:00:00.000', '2026-05-28 10:05:00.000'),
(1007, 'SEED20260529007', 10001, 'membership', NULL, '专业版月卡', 2900, 'CNY', NULL, 1, 30, 1, '会员购买-专业版月卡', 2900, 2900, 'paid', 'paid', 'wechat_jsapi', 'granted', '', '2026-05-20 08:05:00.000', '2026-05-20 08:35:00.000', '2026-05-20 08:00:00.000', '2026-05-20 08:05:00.000'),
(1008, 'SEED20260529008', 10003, 'membership', NULL, '商业版季卡', 24900, 'CNY', NULL, 5, 90, 5, '会员购买-商业版季卡', 24900, 24900, 'paid', 'paid', 'wechat_jsapi', 'granted', '', '2026-05-24 12:05:00.000', '2026-05-24 12:35:00.000', '2026-05-24 12:00:00.000', '2026-05-24 12:05:00.000');

INSERT IGNORE INTO user_memberships (user_id, version_id, plan_id, order_id, level_before, level_after, status, started_at, expire_at, source, auto_renew, created_at) VALUES
(10001, (SELECT id FROM member_versions WHERE version_key='pro'), 1, 1007, 'free', 'pro', 'active', '2026-05-20 08:05:00.000', '2026-07-20 08:00:00.000', 'purchase', 0, NOW(3)),
(10003, (SELECT id FROM member_versions WHERE version_key='business'), 5, 1008, 'pro', 'business', 'active', '2026-05-24 12:05:00.000', '2026-08-22 12:00:00.000', 'purchase', 0, NOW(3)),
(10005, (SELECT id FROM member_versions WHERE version_key='pro'), 1, 1004, 'free', 'pro', 'active', '2026-05-23 16:05:00.000', '2026-06-23 16:00:00.000', 'purchase', 0, NOW(3));

-- ===== 9. 文件记录 =====
INSERT IGNORE INTO files (id, file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, cdn_url, access_url, file_category, visibility, is_deleted, ref_type, ref_id, created_at) VALUES
(3001, 'FSEED2026052901', 10001, 'local', 'uploads/avatar_10001.png', 'avatar.png', 'image/png', 51200, 256, 256, 0, '', '/static/uploads/avatar_10001.png', 'avatar', 'public', 0, NULL, NULL, '2026-05-20 08:10:00.000'),
(3002, 'FSEED2026052902', 10001, 'local', 'uploads/ref_cat_001.jpg', '参考图-猫咪.jpg', 'image/jpeg', 204800, 1024, 1024, 0, '', '/static/uploads/ref_cat_001.jpg', 'ref_image', 'private', 0, 'task_output', '2001', '2026-05-29 09:00:00.000'),
(3003, 'FSEED2026052903', 10002, 'local', 'uploads/ref_city_001.png', '参考图-城市.png', 'image/png', 307200, 1920, 1080, 0, '', '/static/uploads/ref_city_001.png', 'ref_image', 'private', 0, 'task_output', '2002', '2026-05-29 09:10:00.000'),
(3004, 'FSEED2026052904', 10003, 'local', 'uploads/output_2003_0.png', 'AI生成-产品图.png', 'image/png', 409600, 2048, 2048, 0, '', '/static/uploads/output_2003_0.png', 'ai_output', 'public', 0, 'task_output', '2003', '2026-05-29 09:25:00.000'),
(3005, 'FSEED2026052905', 10001, 'local', 'uploads/output_2004_0.mp4', 'AI生成-海浪.mp4', 'video/mp4', 5242880, 1920, 1080, 5, '', '/static/uploads/output_2004_0.mp4', 'ai_video', 'public', 0, 'task_output', '2004', '2026-05-29 08:15:00.000');

-- ===== 10. 模板数据 =====
INSERT IGNORE INTO templates (id, title, description, template_type, target_feature, usage_type, display_config, source, cover_url, preview_url, prompt, negative_prompt, params_json, ratio, style, scene, category_id, tags_json, sort_order, is_recommended, is_hot, is_enabled, visibility, status, review_status, access_level, visibility_scope, usage_scope, usage_count, favorite_count, created_at, updated_at) VALUES
(5001, '电商主图-白底产品', '专业白底产品图模板，适合电商平台使用', 'image', 'text_to_image', 'generate', '{"text_to_image":{"pinned":true,"pinOrder":1}}', 'official', 'https://picsum.photos/seed/tpl1/400/400', 'https://picsum.photos/seed/tpl1/1024/1024', 'A professional product photo on a clean white background, studio lighting', '', '{"ratio":"1:1","quality":"2K","style":"写实"}', '1:1', '写实', '电商', 1, '["电商","产品","白底"]', 10, 1, 1, 1, 'public', 'approved', 'approved', 'free', 'all', 'all', 1234, 89, NOW(3), NOW(3)),
(5002, '小红书风格-生活美学', '温暖色调生活场景模板，适合小红书配图', 'image', 'text_to_image', 'generate', '{"text_to_image":{"pinned":true,"pinOrder":2}}', 'official', 'https://picsum.photos/seed/tpl2/400/400', 'https://picsum.photos/seed/tpl2/1024/1024', 'Warm lighting, cozy lifestyle scene, minimalistic aesthetic, soft tones', '', '{"ratio":"4:5","quality":"2K","style":"生活美学"}', '4:5', '生活美学', '小红书', 2, '["小红书","生活","温暖"]', 20, 1, 0, 1, 'public', 'approved', 'approved', 'free', 'all', 'all', 2345, 156, NOW(3), NOW(3)),
(5003, '赛博朋克-城市夜景', '未来感赛博朋克风格模板', 'image', 'text_to_image', 'generate', '{"text_to_image":{"pinned":false,"pinOrder":0}}', 'official', 'https://picsum.photos/seed/tpl3/400/400', 'https://picsum.photos/seed/tpl3/1024/1024', 'Cyberpunk city at night, neon lights, rain, blade runner style', '', '{"ratio":"16:9","quality":"4K","style":"赛博朋克"}', '16:9', '赛博朋克', '夜景', 3, '["赛博朋克","夜景","未来"]', 30, 1, 1, 1, 'public', 'approved', 'approved', 'free', 'all', 'all', 3456, 234, NOW(3), NOW(3)),
(5004, '图片编辑-去背景变白色', '产品图去除杂色背景，替换为纯白', 'image', 'image_edit', 'edit', '{"image_edit":{"pinned":true,"pinOrder":1}}', 'official', 'https://picsum.photos/seed/tpl4/400/400', 'https://picsum.photos/seed/tpl4/1024/1024', 'Remove the background, replace with pure white, keep the main subject', '', '{"ratio":"1:1"}', '1:1', '', '编辑', 1, '["编辑","去背景"]', 10, 0, 0, 1, 'public', 'approved', 'approved', 'free', 'all', 'all', 567, 42, NOW(3), NOW(3)),
(5005, '图生图-风格迁移', '上传参考图，变换为水彩画风格', 'image', 'image_to_image', 'reference', '{"image_to_image":{"pinned":true,"pinOrder":1}}', 'official', 'https://picsum.photos/seed/tpl5/400/400', 'https://picsum.photos/seed/tpl5/1024/1024', 'Transform this image into a watercolor painting style, soft brush strokes', '', '{"ratio":"1:1","quality":"2K","style":"水彩"}', '1:1', '水彩', '艺术', 2, '["风格迁移","水彩","艺术"]', 10, 0, 0, 1, 'public', 'approved', 'approved', 'free', 'all', 'all', 789, 67, NOW(3), NOW(3)),
(5006, '文生视频-产品展示', '3秒产品宣传短视频模板', 'video', 'text_to_video', 'generate', '{"text_to_video":{"pinned":true,"pinOrder":1}}', 'official', 'https://picsum.photos/seed/vtpl1/400/400', 'https://picsum.photos/seed/vtpl1/1920/1080', 'A 3 second product showcase video, smooth camera pan, professional lighting', '', '{"duration":"3s","ratio":"16:9","resolution":"1080p"}', '16:9', '', '产品', 1, '["视频","产品","展示"]', 10, 1, 0, 1, 'public', 'approved', 'approved', 'free', 'all', 'all', 456, 34, NOW(3), NOW(3));
