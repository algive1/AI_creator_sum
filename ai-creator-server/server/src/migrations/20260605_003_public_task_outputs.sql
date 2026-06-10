UPDATE files
   SET visibility = 'public',
       updated_at = NOW(3)
 WHERE ref_type = 'task_output'
   AND file_category IN ('ai_output', 'ai_video')
   AND visibility <> 'public'
   AND is_deleted = 0;
