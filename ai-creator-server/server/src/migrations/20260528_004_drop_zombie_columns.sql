-- Drop zombie columns: defined in schema but never read/written by any code
-- These were either planned features that were never implemented, or legacy fields
-- from a deleted service (model-router.service.ts).

-- ai_task_cost_logs.tokens_in / tokens_out
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_task_cost_logs' AND column_name = 'tokens_in');
SET @sql := IF(@col > 0, 'ALTER TABLE ai_task_cost_logs DROP COLUMN tokens_in', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_task_cost_logs' AND column_name = 'tokens_out');
SET @sql := IF(@col > 0, 'ALTER TABLE ai_task_cost_logs DROP COLUMN tokens_out', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ai_models.membership_min_level
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_models' AND column_name = 'membership_min_level');
SET @sql := IF(@col > 0, 'ALTER TABLE ai_models DROP COLUMN membership_min_level', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ai_tasks.member_discount_rate
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_tasks' AND column_name = 'member_discount_rate');
SET @sql := IF(@col > 0, 'ALTER TABLE ai_tasks DROP COLUMN member_discount_rate', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- audit_logs.raw_response
SET @col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_logs' AND column_name = 'raw_response');
SET @sql := IF(@col > 0, 'ALTER TABLE audit_logs DROP COLUMN raw_response', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
