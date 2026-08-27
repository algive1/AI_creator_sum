-- Seed official template usage counts for display and document inspiration_top display position.

UPDATE templates
   SET usage_count = FLOOR(20 + RAND(id) * 281),
       updated_at = NOW(3)
 WHERE source = 'official'
   AND deleted_at IS NULL;
