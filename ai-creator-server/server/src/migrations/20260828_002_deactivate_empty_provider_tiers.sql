-- Provider-specific tiers whose only model disappeared upstream cannot remain
-- active: they would expose an entry with no executable live model. This does
-- not deactivate a model; the strict sync already archived and hard-deleted it.
UPDATE model_tiers t
   SET t.status = 'inactive',
       t.updated_at = NOW(3)
 WHERE t.status = 'active'
   AND (LEFT(t.tier_key, 7) = 'xiaoma_' OR LEFT(t.tier_key, 9) = 'hongniao_')
   AND NOT EXISTS (
     SELECT 1
       FROM tier_model_bindings b
       JOIN ai_models m
         ON m.id = b.model_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
      WHERE b.tier_id = t.id
   );
