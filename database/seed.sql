-- ====================================================================
-- DỮ LIỆU KHỞI TẠO (SEED DATA) CHO SQL SERVER
-- ====================================================================

-- 1. Người dùng mẫu theo từng vai trò
INSERT INTO nguoi_dung (vai_tro, ho_ten, sdt, email, mat_khau_bam)
VALUES 
    ('MANAGER', N'Nguyễn Hoàng Quân', '0905123456', 'quanly@pingpongbros.vn', '123456'),
    ('STAFF', N'Trần Thu Hà', '0935222333', 'nhanvien@pingpongbros.vn', '123456'),
    ('TEACHER', N'Võ Thị Mai', '0977888999', 'giaovien@pingpongbros.vn', '123456'),
    ('GUEST', N'Đặng Hoàng Nam', '0932111222', 'vanglai@gmail.com', '123456'),
    ('MEMBER', N'Nguyễn Văn An', '0912345678', 'khachthang@gmail.com', '123456');

-- 2. Gói đăng ký hội viên
INSERT INTO goi_dang_ky (id, ten, so_thang, gia, luot_moi_ky)
VALUES 
    ('p1', N'Gói 1 tháng', 1, 449000, 30),
    ('p3', N'Gói 3 tháng', 3, 1149000, 30),
    ('p6', N'Gói 6 tháng', 6, 1999000, 30);

-- 3. Cấu hình hệ thống mặc định
INSERT INTO cau_hinh (khoa, gia_tri, mo_ta)
VALUES 
    ('court_price', '20000', N'Giá chơi lẻ 20.000đ/người/giờ'),
    ('teacher_price', '250000', N'Đơn giá lượt dạy của giáo viên 250.000đ/lượt'),
    ('hold_limit_minutes', '15', N'Thời gian giữ bàn tối đa 15 phút'),
    ('default_hours', '2', N'Thời lượng chơi mặc định 2 giờ'),
    ('max_people_per_table', '4', N'Sức chứa tối đa 4 người/bàn'),
    ('opening_hour', '6', N'Giờ mở cửa 06:00'),
    ('closing_hour', '21', N'Giờ đóng cửa 21:00'),
    ('class_cutoff_hour', '19', N'Lớp học kết thúc trước 19:00, sau đó mở cho khách'),
    ('alert_minutes', '30', N'Nhắc lịch trước 30 phút');

-- 4. 16 Bàn bóng bàn (Dãy 1: 1-4 khu dạy học; Dãy 2-4: 5-16 khu khách)
INSERT INTO ban (so_ban, khu, day_so, suc_chua, trang_thai)
VALUES 
    (1, 'day_hoc', 1, 4, 'busy'),
    (2, 'day_hoc', 1, 4, 'busy'),
    (3, 'day_hoc', 1, 4, 'available'),
    (4, 'day_hoc', 1, 4, 'available'),
    (5, 'khach', 2, 4, 'busy'),
    (6, 'khach', 2, 4, 'busy'),
    (7, 'khach', 2, 4, 'available'),
    (8, 'khach', 2, 4, 'available'),
    (9, 'khach', 3, 4, 'busy'),
    (10, 'khach', 3, 4, 'available'),
    (11, 'khach', 3, 4, 'available'),
    (12, 'khach', 3, 4, 'available'),
    (13, 'khach', 4, 4, 'available'),
    (14, 'khach', 4, 4, 'available'),
    (15, 'khach', 4, 4, 'available'),
    (16, 'khach', 4, 4, 'available');

-- 5. Khách hàng mẫu
INSERT INTO khach (ho_ten, sdt, email, loai, nguoi_dung_id)
VALUES 
    (N'Nguyễn Văn An', '0912345678', 'khachthang@gmail.com', 'thang', 5),
    (N'Trần Thị Bình', '0903456789', 'binh.tran@gmail.com', 'thang', NULL),
    (N'Lê Quốc Cường', '0987654321', 'cuong.le@gmail.com', 'thang', NULL),
    (N'Phạm Minh Đức', '0356789012', 'duc.pham@outlook.com', 'thang', NULL),
    (N'Hoàng Thu Hà', '0765432109', 'thuha@gmail.com', 'thang', NULL);

-- 6. Đăng ký gói mẫu (Có trạng thái sắp hết lượt để kiểm tra cảnh báo và gia hạn)
INSERT INTO dang_ky_goi (khach_id, goi_id, bat_dau, ket_thuc, tong_luot, da_dung, trang_thai)
VALUES 
    (1, 'p1', DATEADD(DAY, -12, SYSUTCDATETIME()), DATEADD(DAY, 18, SYSUTCDATETIME()), 30, 26, 'active'), -- còn 4 lượt (cảnh báo <=5)
    (2, 'p3', DATEADD(DAY, -40, SYSUTCDATETIME()), DATEADD(DAY, 50, SYSUTCDATETIME()), 90, 56, 'active'),
    (3, 'p1', DATEADD(DAY, -20, SYSUTCDATETIME()), DATEADD(DAY, 10, SYSUTCDATETIME()), 30, 30, 'expired'), -- hết lượt
    (4, 'p6', DATEADD(DAY, -70, SYSUTCDATETIME()), DATEADD(DAY, 110, SYSUTCDATETIME()), 180, 60, 'active'),
    (5, 'p1', DATEADD(DAY, -25, SYSUTCDATETIME()), DATEADD(DAY, 5, SYSUTCDATETIME()), 30, 27, 'warning'); -- còn 3 lượt (cảnh báo)

-- 7. Lớp học mẫu
INSERT INTO lop_hoc (giao_vien_id, giao_vien_ten, ngay, bat_dau, ket_thuc, ban_ids, trang_thai)
VALUES 
    (3, N'Võ Thị Mai', CAST(SYSUTCDATETIME() AS DATE), 9, 11, '1, 2', 'approved'),
    (3, N'Võ Thị Mai', CAST(DATEADD(DAY, 1, SYSUTCDATETIME()) AS DATE), 15, 17, '3, 4', 'pending');

-- 8. Giao dịch thanh toán ban đầu
INSERT INTO thanh_toan (loai, so_tien, tham_chieu, nguoi_thu)
VALUES 
    ('tien_choi', 120000, N'Bàn 11 · Nguyễn Văn Hải', N'Trần Thu Hà'),
    ('goi', 449000, N'Gói 1 tháng · Hoàng Thu Hà', N'Trần Thu Hà'),
    ('tien_choi', 80000, N'Bàn 12 · Phan Văn Lộc', N'Trần Thu Hà');
