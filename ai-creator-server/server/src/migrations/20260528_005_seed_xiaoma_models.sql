-- Seed: 小马AI (api.lk888.ai) provider + models
-- Uses dedicated xiaoma adapter: POST /v1/media/generate → GET /v1/media/status

INSERT IGNORE INTO ai_model_providers (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, remark, status, created_at)
VALUES ('小马AI', 'xiaoma', 'xiaoma', 'https://api.lk888.ai', '', 600, 3, '小马AI中转站。协议: POST /v1/media/generate 创建, GET /v1/media/status 轮询。鉴权: Bearer。', 'active', NOW(3));

SET @xiaoma_id = (SELECT id FROM ai_model_providers WHERE provider_key = 'xiaoma' LIMIT 1);

-- ====== 视频模型 ======

INSERT IGNORE INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, points_cost, timeout_seconds, retry_times, config, status)
VALUES
(@xiaoma_id, '快乐马-文生视频', '快乐马-文生视频', 'video', 'text_to_video', 'happyhorse-t2v', 20, 600, 2,
 JSON_OBJECT(
   'description', '阿里百炼 HappyHorse 文生视频。纯文本生成运动连贯短视频。720P/1080P，3-15秒，5种宽高比。',
   'params', JSON_OBJECT(
     'resolution', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('720P','1080P'),'label','分辨率'),
     'ratio', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('16:9','9:16','1:1','4:3','3:4'),'label','宽高比'),
     'duration', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY(3,4,5,6,7,8,9,10,11,12,13,14,15),'label','视频时长(秒)')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, '快乐马-视频编辑', '快乐马-视频编辑', 'video', 'video_edit', 'happyhorse-video-edit', 30, 600, 2,
 JSON_OBJECT(
   'description', '阿里百炼 HappyHorse 视频编辑。上传源视频+可选参考图，自然语言完成风格迁移/换装/局部改写。支持720P/1080P。按输入+输出合计时长计费。',
   'params', JSON_OBJECT(
     'resolution', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('720P','1080P'),'label','分辨率'),
     'video', JSON_OBJECT('type','upload','required',true,'max',1,'label','待编辑参考视频','accept','MP4/MOV'),
     'images', JSON_OBJECT('type','upload','required',false,'max',5,'label','参考图片(可选0-5张)'),
     'audio_setting', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('auto','origin'),'label','输出声音')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, 'Sora-2 官转版', 'Sora-2 官转版', 'video', 'text_to_video', 'sora-2', 35, 600, 2,
 JSON_OBJECT(
   'description', 'OpenAI Sora-2 稳定版，高质量视频生成。官方接口直连，100%成功率，质量更高。横版传横图，竖版传竖图。',
   'params', JSON_OBJECT(
     'duration', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY(4,8,12),'label','视频时长(秒)'),
     'orientation', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('portrait','landscape'),'label','画面方向'),
     'input_reference', JSON_OBJECT('type','upload','required',false,'max',1,'label','参考图片(可选1张)')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, 'veo3.1', 'veo3.1', 'video', 'text_to_video', 'veo3.1', 40, 600, 2,
 JSON_OBJECT(
   'description', '谷歌高可控性视频模型。首尾帧控制+精准运镜，自带背景音乐。提示词建议：主体+动作+场景+运镜。',
   'params', JSON_OBJECT(
     'generation_mode', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('fast','null','pro','components'),'label','生成模式'),
     'aspect_ratio', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('9:16','16:9'),'label','视频比例'),
     'images', JSON_OBJECT('type','upload','required',false,'max',3,'label','参考图片(首帧/首尾帧)'),
     'enhance_prompt', JSON_OBJECT('type','bool','required',true,'label','提示词优化(翻译中文为英文)'),
     'enable_upsample', JSON_OBJECT('type','bool','required',true,'label','视频超分')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, '快乐马-参考生', '快乐马-参考生', 'video', 'image_to_video', 'happyhorse-r2v', 25, 600, 2,
 JSON_OBJECT(
   'description', '阿里百炼 HappyHorse 参考生(R2V)。多张参考图角色/物件融合进同一短片。720P/1080P，3-15秒，多比例。',
   'params', JSON_OBJECT(
     'resolution', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('720P','1080P'),'label','分辨率'),
     'duration', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY(3,4,5,6,7,8,9,10,11,12,13,14,15),'label','视频时长(秒)'),
     'ratio', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('16:9','9:16','3:4','4:3','1:1'),'label','宽高比'),
     'images', JSON_OBJECT('type','upload','required',true,'min',1,'max',5,'label','参考图片(1-5张)')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, '快乐马-首帧', '快乐马-首帧', 'video', 'image_to_video', 'happyhorse-i2v', 25, 600, 2,
 JSON_OBJECT(
   'description', '阿里百炼 HappyHorse 图生视频。单张首帧图+提示词生成短视频。画幅随首帧自适应。720P/1080P，3-15秒。',
   'params', JSON_OBJECT(
     'resolution', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('720P','1080P'),'label','分辨率'),
     'duration', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY(3,4,5,6,7,8,9,10,11,12,13,14,15),'label','视频时长(秒)'),
     'images', JSON_OBJECT('type','upload','required',true,'max',1,'label','首帧参考图(必传1张)')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

-- ====== 音频模型 ======

(@xiaoma_id, 'Suno 音乐生成 4.5', 'Suno 音乐生成 4.5', 'audio', '', 'suno-v4.5', 15, 300, 2,
 JSON_OBJECT(
   'description', 'Suno V4.5 音乐生成模型。输入歌词+风格描述生成完整人声歌曲，支持纯音乐、续写、卡拉OK字幕。最长4分钟。',
   'params', JSON_OBJECT(
     'mv', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('chirp-v4-5','chirp-v4','chirp-v3-5','chirp-bluejay'),'label','模型版本'),
     'make_instrumental', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('song','instrumental'),'label','生成模式'),
     'vocal_gender', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('auto','m','f'),'label','声音性别'),
     'sample_rate', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY(44100,48000),'label','采样率'),
     'bitrate', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY(128000,192000,256000),'label','比特率')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, '海螺 语音克隆 2.8', '海螺 语音克隆 2.8', 'audio', '', 'speech-2.8', 10, 120, 2,
 JSON_OBJECT(
   'description', 'MiniMax 海螺语音克隆。上传音频复刻专属音色，首次激活后永久有效。HD/Turbo两种质量，支持语速/语调/情绪调节。需先 POST /v1/skills/voices/clone 创建音色。',
   'params', JSON_OBJECT(
     'quality', JSON_OBJECT('type','enum','required',true,'values',JSON_ARRAY('turbo','hd'),'label','合成质量'),
     'speed', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY(0.5,0.75,1,1.25,1.5,2),'label','语速'),
     'pitch', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY(-6,-3,0,3,6),'label','语调'),
     'emotion', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('auto','happy','sad','angry','fearful','surprised','calm'),'label','情绪'),
     'sound_effects', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('none','spacious_echo','auditorium_echo','lofi_telephone','robotic'),'label','音效'),
     'voice_id', JSON_OBJECT('type','string','required',true,'label','克隆音色ID')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}','voice_clone','/v1/skills/voices/clone','voice_list','/v1/skills/voices?model=speech-2.8'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, '豆包 语音合成 2.0', '豆包 语音合成 2.0', 'audio', '', 'doubao-tts-2.0', 8, 120, 2,
 JSON_OBJECT(
   'description', '火山引擎豆包语音合成2.0。上百种精品预设音色，支持多情感、多语种，最大10万字符。无需克隆。',
   'params', JSON_OBJECT(
     'speaker', JSON_OBJECT('type','string','required',true,'label','音色标识(默认zh_female_vv_uranus_bigtts)'),
     'speech_rate', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY(-50,-25,0,25,50,100),'label','语速'),
     'emotion', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('auto','happy','sad','angry','fearful','surprised','calm'),'label','情感'),
     'emotion_scale', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY(1,2,3,4,5),'label','情绪强度'),
     'format', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('mp3','wav','ogg_opus'),'label','音频格式')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}','voice_list','/v1/skills/voices?model=doubao-tts-2.0'),
   'protocol', 'xiaoma_media'
 ), 'active'),

(@xiaoma_id, 'Gemini-3.1-TTS', 'Gemini-3.1-TTS', 'audio', '', 'gemini-3.1-flash-tts-preview', 8, 120, 2,
 JSON_OBJECT(
   'description', 'Google Gemini 3.1 Flash 原生TTS。30种预置音色，24种语言，支持双人对话，自然语言描述语气。',
   'params', JSON_OBJECT(
     'voice_id', JSON_OBJECT('type','string','required',true,'label','音色标识(如Zephyr)'),
     'model_version', JSON_OBJECT('type','enum','required',false,'values',JSON_ARRAY('pro','flash'),'label','模型版本')
   ),
   'endpoints', JSON_OBJECT('create','/v1/media/generate','query','/v1/media/status?task_id={task_id}','voice_list','/v1/skills/voices?model=gemini-2.5-pro-preview-tts'),
   'protocol', 'xiaoma_media'
 ), 'active');
