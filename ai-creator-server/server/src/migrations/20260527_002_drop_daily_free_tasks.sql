SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'member_plan_point_rules' AND column_name = 'daily_free_tasks'
);
SET @sql := IF(@col_exists > 0,
  'ALTER TABLE member_plan_point_rules DROP COLUMN daily_free_tasks',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELETE FROM member_plan_rights WHERE right_key = 'daily_free_tasks';
