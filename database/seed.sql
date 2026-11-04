INSERT INTO members (name, phone, email, package_type, start_date, end_date, total_turns, used_turns, status)
VALUES
  ('Nguyễn Văn An', '0912345678', 'khachthang@gmail.com', 'p1', NOW() - INTERVAL '12 days', NOW() + INTERVAL '18 days', 30, 26, 'active'),
  ('Trần Thị Bình', '0903456789', 'binh.tran@gmail.com', 'p3', NOW() - INTERVAL '40 days', NOW() + INTERVAL '50 days', 90, 56, 'active'),
  ('Lê Quốc Cường', '0987654321', 'cuong.le@gmail.com', 'p1', NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days', 30, 30, 'warning'),
  ('Phạm Minh Đức', '0356789012', 'duc.pham@outlook.com', 'p6', NOW() - INTERVAL '70 days', NOW() + INTERVAL '110 days', 180, 60, 'active'),
  ('Hoàng Thu Hà', '0765432109', 'thuha@gmail.com', 'p1', NOW() - INTERVAL '25 days', NOW() + INTERVAL '5 days', 30, 27, 'active');

INSERT INTO tables (table_number, zone, capacity, status)
VALUES
  (1, 'teaching', 4, 'busy'),
  (2, 'teaching', 4, 'busy'),
  (3, 'teaching', 4, 'available'),
  (4, 'teaching', 4, 'available'),
  (5, 'customer', 4, 'busy'),
  (6, 'customer', 4, 'busy'),
  (7, 'customer', 4, 'available'),
  (8, 'customer', 4, 'available'),
  (9, 'customer', 4, 'busy'),
  (10, 'customer', 4, 'available'),
  (11, 'customer', 4, 'available'),
  (12, 'customer', 4, 'available'),
  (13, 'customer', 4, 'available'),
  (14, 'customer', 4, 'available'),
  (15, 'customer', 4, 'available'),
  (16, 'customer', 4, 'available');

INSERT INTO bookings (table_id, member_id, customer_name, phone, email, booking_type, start_time, duration_hours, people_count, status, amount)
VALUES
  ((SELECT id FROM tables WHERE table_number = 5), NULL, 'Đặng Hoàng Nam', '0932111222', 'vanglai@gmail.com', 'WALK_IN', NOW() - INTERVAL '1 hour', 2, 3, 'CHECKED_IN', 120000),
  ((SELECT id FROM tables WHERE table_number = 6), NULL, 'Bùi Anh Tuấn', '0944555666', 'anh.tuan@gmail.com', 'WALK_IN', NOW() - INTERVAL '75 minutes', 1, 2, 'CHECKED_IN', 40000),
  ((SELECT id FROM tables WHERE table_number = 9), (SELECT id FROM members WHERE email = 'duc.pham@outlook.com'), 'Phạm Minh Đức', '0356789012', 'duc.pham@outlook.com', 'MEMBER', NOW() - INTERVAL '30 minutes', 2, 1, 'CHECKED_IN', 40000),
  ((SELECT id FROM tables WHERE table_number = 7), (SELECT id FROM members WHERE email = 'khachthang@gmail.com'), 'Nguyễn Văn An', '0912345678', 'khachthang@gmail.com', 'MEMBER', NOW() + INTERVAL '20 minutes', 2, 2, 'CONFIRMED', 0),
  ((SELECT id FROM tables WHERE table_number = 8), NULL, 'Lý Gia Bảo', '0918777666', 'giabao@gmail.com', 'WALK_IN', NOW() + INTERVAL '1 hour', 1.5, 4, 'CONFIRMED', 0);

INSERT INTO class_sessions (teacher_id, teacher_name, session_date, start_hour, end_hour, tables, status)
VALUES
  (1, 'Võ Thị Mai', CURRENT_DATE, 9, 11, '[1,2]', 'approved'),
  (1, 'Võ Thị Mai', CURRENT_DATE + INTERVAL '1 day', 15, 17, '[3,4]', 'pending');

INSERT INTO payments (type, amount, reference, who)
VALUES
  ('tien_choi', 120000, 'Bàn 11 · Nguyễn Văn Hải', 'Trần Thu Hà'),
  ('goi', 449000, 'Gói 1 tháng · Hoàng Thu Hà', 'Trần Thu Hà'),
  ('tien_choi', 80000, 'Bàn 12 · Phan Văn Lộc', 'Trần Thu Hà');
