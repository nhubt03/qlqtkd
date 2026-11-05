import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dashboardData } from './data/mock.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'PingPongBros API', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard', (_req, res) => {
  // Cập nhật lại stats động
  dashboardData.stats = {
    totalRevenue: dashboardData.payments.reduce((sum, item) => sum + item.amount, 0),
    todayBookings: dashboardData.bookings.length,
    activeMembers: dashboardData.members.filter((member) => member.status === 'active' || (member.totalTurns - member.usedTurns > 0)).length,
    classesPending: dashboardData.classes.filter((item) => item.status === 'pending').length,
  };
  res.json(dashboardData);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const cleaned = String(email || '').toLowerCase().trim();

  const user = dashboardData.users.find(
    (item) => (item.email.toLowerCase() === cleaned || item.phone === cleaned) && item.password === String(password || '')
  );

  if (!user) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu.' });
  }

  const { password: _password, ...safeUser } = user;
  return res.json({ user: safeUser, token: 'demo-token' });
});

app.get('/api/tables', (_req, res) => {
  res.json(dashboardData.tables);
});

app.get('/api/members', (_req, res) => {
  res.json(dashboardData.members);
});

app.get('/api/bookings', (_req, res) => {
  res.json(dashboardData.bookings);
});

app.get('/api/classes', (_req, res) => {
  res.json(dashboardData.classes);
});

// Giáo viên đăng ký lớp học: tự động phân bổ 2 bàn khu dạy học (bàn 1-4), kết thúc trước 19:00
app.post('/api/classes', (req, res) => {
  const body = req.body ?? {};
  const startHour = Number(body.startHour ?? 10);
  const endHour = startHour + 2;

  if (startHour < dashboardData.config.openingHour || endHour > dashboardData.config.classCutoffHour) {
    return res.status(400).json({ message: `Lớp học chỉ được đăng ký từ ${dashboardData.config.openingHour}:00 đến trước ${dashboardData.config.classCutoffHour}:00.` });
  }

  // Tự động phân bổ 2 bàn trống thuộc khu dạy học (1,2 hoặc 3,4)
  const sessionDateStr = new Date(body.date ?? Date.now()).toDateString();
  const existingClasses = dashboardData.classes.filter(
    (c) =>
      c.status !== 'rejected' &&
      new Date(c.date).toDateString() === sessionDateStr &&
      !(endHour <= c.startHour || startHour >= c.endHour)
  );

  const usedTables = new Set<number>();
  existingClasses.forEach((c) => c.tables.forEach((t) => usedTables.add(t)));

  let allocatedTables: number[] = [];
  if (!usedTables.has(1) && !usedTables.has(2)) {
    allocatedTables = [1, 2];
  } else if (!usedTables.has(3) && !usedTables.has(4)) {
    allocatedTables = [3, 4];
  } else {
    return res.status(400).json({ message: 'Khu dạy học (bàn 1-4) đã kín lớp trong khung giờ này. Vui lòng chọn giờ khác.' });
  }

  const newClass = {
    id: dashboardData.classes.length + 1,
    teacherId: Number(body.teacherId ?? 3),
    teacherName: String(body.teacherName ?? 'Giáo viên'),
    date: new Date(body.date ?? Date.now()).toISOString(),
    startHour,
    endHour,
    tables: allocatedTables,
    status: 'pending' as const,
  };

  dashboardData.classes.push(newClass);
  res.status(201).json({ ok: true, message: `Đã gửi yêu cầu đăng ký lớp học (${allocatedTables.join(', ')}). Chờ quản lý phê duyệt.`, classSession: newClass });
});

app.get('/api/payments', (_req, res) => {
  res.json(dashboardData.payments);
});

// Đặt bàn online hoặc trực tiếp
app.post('/api/bookings', (req, res) => {
  const body = req.body ?? {};
  const booking = {
    id: dashboardData.bookings.length + 1,
    tableId: Number(body.tableId),
    customerName: String(body.customerName ?? ''),
    phone: String(body.phone ?? ''),
    email: String(body.email ?? ''),
    type: (body.type ?? 'WALK_IN') as 'WALK_IN' | 'MEMBER' | 'TEACHER',
    startTime: new Date(body.startTime ?? Date.now()).toISOString(),
    duration: Number(body.duration ?? 2),
    people: Number(body.people ?? 2),
    status: (body.status ?? 'CONFIRMED') as 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED',
    amount: Number(body.amount ?? 0),
    memberId: body.memberId ?? null,
  };

  dashboardData.bookings.push(booking);

  if (booking.status === 'CHECKED_IN') {
    const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
    if (table) table.status = 'busy';
  }

  res.status(201).json(booking);
});

// Check-in bàn
app.post('/api/bookings/:id/checkin', (req, res) => {
  const id = Number(req.params.id);
  const booking = dashboardData.bookings.find((b) => b.id === id);

  if (!booking) {
    return res.status(404).json({ message: 'Không tìm thấy lượt đặt.' });
  }

  booking.status = 'CHECKED_IN';
  const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
  if (table) {
    table.status = 'busy';
  }

  res.json({ ok: true, message: `Check-in thành công bàn ${booking.tableId} cho ${booking.customerName}.`, booking });
});

// Check-out bàn và tính tiền / trừ lượt
app.post('/api/bookings/:id/checkout', (req, res) => {
  const id = Number(req.params.id);
  const booking = dashboardData.bookings.find((b) => b.id === id);

  if (!booking) {
    return res.status(404).json({ message: 'Không tìm thấy lượt đặt.' });
  }

  booking.status = 'CHECKED_OUT';
  const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
  if (table) {
    table.status = 'available';
  }

  let finalAmount = 0;
  let message = '';

  if (booking.type === 'WALK_IN') {
    finalAmount = booking.amount > 0 ? booking.amount : (booking.people * booking.duration * dashboardData.config.courtPrice);
    message = `Check-out thành công. Thu tiền khách vãng lai: ${finalAmount.toLocaleString('vi-VN')}đ.`;
    dashboardData.payments.push({
      id: dashboardData.payments.length + 1,
      type: 'tien_choi',
      amount: finalAmount,
      reference: `Bàn ${booking.tableId} · ${booking.customerName}`,
      who: 'Nhân viên quầy',
      createdAt: new Date().toISOString(),
    });
  } else if (booking.type === 'MEMBER') {
    // Trừ lượt khách tháng
    const member = dashboardData.members.find((m) => m.id === booking.memberId || m.phone === booking.phone);
    if (member) {
      member.usedTurns += 1;
      const left = Math.max(0, member.totalTurns - member.usedTurns);
      if (left <= 0) member.status = 'expired';
      else if (left <= 5) member.status = 'warning';
      message = `Check-out thành công. Khách tháng đã dùng 1 lượt (còn ${left}/${member.totalTurns} lượt). Không thu tiền mặt.`;
    } else {
      message = 'Check-out thành công cho khách tháng.';
    }
  } else if (booking.type === 'TEACHER') {
    message = 'Check-out lớp dạy thành công. Ghi nhận 1 lượt dạy (250.000đ) vào bảng tổng hợp cuối tháng.';
  }

  // Tự động giải phóng bàn và kiểm tra phân bổ khách từ hàng chờ nếu có
  const waitIndex = dashboardData.bookings.findIndex((b) => b.status === 'PENDING');
  if (waitIndex !== -1 && table) {
    const nextWait = dashboardData.bookings[waitIndex];
    nextWait.tableId = table.tableNumber;
    nextWait.status = 'CONFIRMED';
    table.status = 'busy';
  }

  res.json({ ok: true, amount: finalAmount, message, booking });
});

// Hàng chờ (Waitlist)
app.post('/api/waitlist', (req, res) => {
  const body = req.body ?? {};
  const waitItem = {
    id: dashboardData.bookings.length + 1,
    tableId: 0,
    customerName: String(body.customerName ?? ''),
    phone: String(body.phone ?? ''),
    email: String(body.email ?? ''),
    type: (body.type ?? 'WALK_IN') as 'WALK_IN' | 'MEMBER' | 'TEACHER',
    startTime: new Date(body.startTime ?? Date.now()).toISOString(),
    duration: Number(body.duration ?? 2),
    people: Number(body.people ?? 2),
    status: 'PENDING' as const,
    amount: 0,
    memberId: body.memberId ?? null,
  };

  dashboardData.bookings.push(waitItem);
  res.status(201).json(waitItem);
});

// Duyệt lớp học
app.post('/api/classes/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  const session = dashboardData.classes.find((c) => c.id === id);
  if (!session) return res.status(404).json({ message: 'Không tìm thấy lớp học.' });

  // Kiểm tra xung đột: bàn và giờ với các lớp đã duyệt khác
  const conflict = dashboardData.classes.find(
    (c) =>
      c.id !== id &&
      c.status === 'approved' &&
      new Date(c.date).toDateString() === new Date(session.date).toDateString() &&
      c.tables.some((t) => session.tables.includes(t)) &&
      !(session.endHour <= c.startHour || session.startHour >= c.endHour)
  );

  if (conflict) {
    return res.status(400).json({ message: `Xung đột lịch với lớp học đã duyệt của ${conflict.teacherName} (giờ ${conflict.startHour}:00 - ${conflict.endHour}:00, bàn ${conflict.tables.join(', ')}).` });
  }

  session.status = 'approved';
  res.json({ ok: true, message: `Đã duyệt lớp học thành công cho ${session.teacherName}.`, session });
});

// Từ chối lớp học
app.post('/api/classes/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  const session = dashboardData.classes.find((c) => c.id === id);
  if (!session) return res.status(404).json({ message: 'Không tìm thấy lớp học.' });

  session.status = 'rejected';
  res.json({ ok: true, message: `Đã từ chối lớp học của ${session.teacherName}.`, session });
});

// Gia hạn gói thành viên (CỘNG DỒN LƯỢT theo đúng đặc tả)
app.post('/api/members/:id/renew', (req, res) => {
  const id = Number(req.params.id);
  const { packageId } = req.body ?? {};
  const member = dashboardData.members.find((m) => m.id === id);
  if (!member) return res.status(404).json({ message: 'Không tìm thấy hội viên.' });

  const packConfig: Record<string, { months: number; price: number; turns: number; name: string }> = {
    p1: { months: 1, price: 449000, turns: 30, name: 'Gói 1 tháng' },
    p3: { months: 3, price: 1149000, turns: 90, name: 'Gói 3 tháng' },
    p6: { months: 6, price: 1999000, turns: 180, name: 'Gói 6 tháng' },
  };

  const pack = packConfig[packageId] || packConfig['p1'];

  // CỘNG DỒN số lượt: Tổng lượt = tổng lượt cũ + số lượt gói mới mua
  member.totalTurns += pack.turns;
  member.packageType = packageId;
  member.status = 'active';

  // Gia hạn ngày kết thúc
  const currentEnd = new Date(member.endDate) > new Date() ? new Date(member.endDate) : new Date();
  currentEnd.setDate(currentEnd.getDate() + pack.months * 30);
  member.endDate = currentEnd.toISOString();

  // Ghi nhận doanh thu bán gói
  dashboardData.payments.push({
    id: dashboardData.payments.length + 1,
    type: 'goi',
    amount: pack.price,
    reference: `Gia hạn ${pack.name} · ${member.name}`,
    who: 'Nhân viên quầy',
    createdAt: new Date().toISOString(),
  });

  const remaining = member.totalTurns - member.usedTurns;
  res.json({
    ok: true,
    message: `Gia hạn ${pack.name} thành công cho ${member.name}. Tổng lượt mới: ${remaining}/${member.totalTurns} lượt.`,
    member,
  });
});

// Cập nhật cấu hình
app.post('/api/config', (req, res) => {
  dashboardData.config = { ...dashboardData.config, ...req.body };
  res.json({ ok: true, message: 'Đã lưu cấu hình thành công.', config: dashboardData.config });
});

export default app;
