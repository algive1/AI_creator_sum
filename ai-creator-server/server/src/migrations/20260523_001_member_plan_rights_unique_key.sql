SET @member_plan_right_key_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'member_plan_rights'
    AND index_name = 'uk_plan_right'
);

SET @sql := IF(@member_plan_right_key_exists = 0,
  'ALTER TABLE member_plan_rights ADD UNIQUE INDEX uk_plan_right (plan_id, right_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
