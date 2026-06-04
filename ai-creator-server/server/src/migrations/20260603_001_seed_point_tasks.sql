INSERT INTO point_tasks
  (task_key, title, task_group, reward_points, icon, action_text, reset_cycle, status, sort_order, created_at, updated_at)
VALUES
  ('watch_ad', '观看广告（0/5）', 'daily', 10, 'video', '去完成', 'daily', 'active', 10, NOW(3), NOW(3)),
  ('daily_checkin', '每日签到（1/1）', 'daily', 20, 'calendar', '去签到', 'daily', 'active', 20, NOW(3), NOW(3)),
  ('share_work', '分享作品（0/1）', 'daily', 20, 'share', '去完成', 'daily', 'active', 30, NOW(3), NOW(3)),
  ('invite_friend', '邀请 1 位好友', 'growth', 200, 'invite', '去完成', 'once', 'active', 10, NOW(3), NOW(3)),
  ('open_pro', '开通会员', 'growth', 600, 'pro', '去升级', 'once', 'active', 20, NOW(3), NOW(3)),
  ('checkin_7', '连续签到 7 天', 'growth', 100, 'camera', '去签到', 'once', 'active', 30, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  task_group = VALUES(task_group),
  reward_points = VALUES(reward_points),
  icon = VALUES(icon),
  action_text = VALUES(action_text),
  reset_cycle = VALUES(reset_cycle),
  status = VALUES(status),
  sort_order = VALUES(sort_order),
  updated_at = NOW(3);
