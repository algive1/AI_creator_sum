CREATE TABLE IF NOT EXISTS member_plan_feature_discounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  feature_key VARCHAR(64) NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_plan_feature (plan_id, feature_key),
  INDEX idx_plan (plan_id),
  INDEX idx_feature (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO member_plan_feature_discounts (plan_id, feature_key, discount_percent, status)
SELECT p.id,
       mf.feature_key,
       CASE
         WHEN pr.points_discount_rate > 0 AND pr.points_discount_rate < 1
           THEN ROUND(pr.points_discount_rate * 100, 2)
         ELSE 100.00
       END AS discount_percent,
       'active'
  FROM member_plans p
  JOIN model_features mf ON mf.status = 'active'
  LEFT JOIN member_plan_point_rules pr ON pr.plan_id = p.id;
