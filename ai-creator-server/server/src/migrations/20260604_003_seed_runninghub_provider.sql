-- RunningHub: ComfyUI workflow API platform
-- 不是模型级 API，而是工作流执行平台。每个 "模型" = 工作流 ID。
-- 支持文生图/图生图/图生视频/口型同步等（取决于工作流）。
-- API Key 通过 RUNNINGHUB_API_KEY 环境变量同步。
-- Base URL: https://www.runninghub.cn
-- Provider type: runninghub

SET @provider_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'runninghub' AND deleted_at IS NULL);

INSERT INTO ai_model_providers (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, remark, created_at)
SELECT 'RunningHub', 'runninghub', 'runninghub', 'https://www.runninghub.cn', '', 600, 2, 'active', 'ComfyUI 工作流平台。支持文生图/图生图/图生视频/口型同步等。', NOW(3)
 WHERE @provider_exists = 0;

-- RunningHub 的工作流 ID 在平台上查找，这里只创建供应商骨架。
-- 具体模型（工作流）由管理员在后台手动添加，模型名 = 平台上的工作流名称，
-- upstream_model_code = 工作流 ID（如 2008966334171844609）。
-- 绑定到档位后即可通过标准任务接口调用。
