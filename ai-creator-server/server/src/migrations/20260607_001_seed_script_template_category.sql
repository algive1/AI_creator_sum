INSERT INTO template_categories (name, category_key, icon, sort_order, status, created_at, updated_at) VALUES
('剧本模板', 'script_template', '', 32, 'active', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  updated_at = NOW(3);
