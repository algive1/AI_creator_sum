-- Repair Hongniao model pricing for databases that already ran the
-- 2026-06-18 refresh migration with points_cost/api_cost_cents left at 0.
-- Non-zero admin pricing is preserved.

UPDATE ai_models m
JOIN ai_model_providers p ON p.id = m.provider_id
   SET m.points_cost = IF(COALESCE(m.points_cost, 0) = 0,
         GREATEST(1, ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.billing.amount')) AS DECIMAL(10, 4)) * 10)),
         m.points_cost
       ),
       m.api_cost_cents = IF(COALESCE(m.api_cost_cents, 0) = 0,
         GREATEST(1, ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.billing.amount')) AS DECIMAL(10, 4)) * 100)),
         m.api_cost_cents
       ),
       m.updated_at = NOW(3)
 WHERE p.provider_key = 'hongniao'
   AND p.deleted_at IS NULL
   AND m.deleted_at IS NULL
   AND JSON_EXTRACT(m.config, '$.billing.amount') IS NOT NULL
   AND CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.billing.amount')) AS DECIMAL(10, 4)) > 0
   AND (COALESCE(m.points_cost, 0) = 0 OR COALESCE(m.api_cost_cents, 0) = 0);
