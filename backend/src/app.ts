import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboardData } from './data/mock.js';
import { isDbConnected } from './services/db.js';
import { sendBookingConfirmationEmail, getEmailLogs, sendOtpEmail } from './services/mailer.js';
import { sweepExpiredBookings, sweepExpiredMemberships } from './services/scheduler.js';
import { initStorage, persistStore } from './services/storage.js';
import { hashPassword, verifyPassword, createJwtToken } from './services/security.js';
import type { Role, TransferredConversation, TransferredMessage, User } from './types.js';

dotenv.config();

// Khởi tạo hệ thống lưu trữ vĩnh viễn (Data Persistence on Disk)
initStorage();

/**
 * Ghi nhật ký bảo mật hệ thống (Audit Log - Mục 9)
 */
export function recordAuditLog(actorEmail: string, actorRole: string, action: string, details: string) {
  dashboardData.auditLogs = dashboardData.auditLogs || [];
  const log = {
    id: dashboardData.auditLogs.length + 1,
    timestamp: new Date().toISOString(),
    actorEmail,
    actorRole,
    action,
    details,
  };
  dashboardData.auditLogs.push(log);
  persistStore();
  return log;
}

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'PingPongBros API', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard', (_req, res) => {
  dashboardData.stats = {
    totalRevenue: dashboardData.payments.reduce((sum, item) => sum + item.amount, 0),
    todayBookings: dashboardData.bookings.length,
    activeMembers: dashboardData.members.filter((member) => member.status === 'active' || (member.totalTurns - member.usedTurns > 0)).length,
    classesPending: dashboardData.classes.filter((item) => item.status === 'pending').length,
  };
  res.json(dashboardData);
});

// ==========================================
// 1. XÁC THỰC (ĐĂNG NHẬP / ĐĂNG KÝ)
// ==========================================
const handleLogin = (req: express.Request, res: express.Response) => {
  const { email, password, sdt } = req.body ?? {};

  // Chặn đăng nhập bằng số điện thoại
  const inputEmail = String(email || '').trim();
  if (!inputEmail && sdt) {
    return res.status(400).json({ message: 'Hệ thống chỉ hỗ trợ đăng nhập bằng địa chỉ Email. Vui lòng nhập email.' });
  }

  const cleaned = inputEmail.toLowerCase();
  if (/^[0-9+]+$/.test(cleaned)) {
    return res.status(400).json({ message: 'Vui lòng nhập địa chỉ Email để đăng nhập, không sử dụng số điện thoại.' });
  }

  if (!cleaned) {
    return res.status(400).json({ message: 'Vui lòng nhập địa chỉ Email đăng nhập.' });
  }

  // Tìm người dùng trong danh sách chỉ theo Email (hoặc alias admin)
  let user = dashboardData.users.find(
    (item) =>
      item.email.toLowerCase() === cleaned ||
      (item.role === 'MANAGER' && (cleaned === 'admin' || cleaned === 'admin@pingpongbros.vn' || cleaned === 'quanly@pingpongbros.vn'))
  );

  // Hỗ trợ tài khoản nhân viên test nếu người dùng yêu cầu thử nghiệm
  if (!user && (cleaned === 'nhanvien@pingpongbros.vn' || cleaned === 'nhanvien')) {
    user = {
      id: 99,
      name: 'Nhân Viên Hỗ Trợ',
      email: 'nhanvien@pingpongbros.vn',
      phone: '0935222333',
      password: 'password123',
      role: 'STAFF',
    };
  }

  if (!user) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu.' });
  }

  const passStr = String(password || '');
  const isMatch = verifyPassword(passStr, user.password || '');

  if (!isMatch) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu.' });
  }

  // Cấp phát JSON Web Token (JWT HS256) chuẩn chữ ký số
  const token = createJwtToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  const { password: _password, ...safeUser } = user;
  return res.json({
    ok: true,
    user: {
      ...safeUser,
      firstLogin: !!user.firstLogin,
    },
    token,
    mustChangePassword: !!user.firstLogin,
  });
};

app.post('/api/auth/login', handleLogin);
app.post('/api/dang-nhap', handleLogin);

// Kho lưu trữ mã OTP trong bộ nhớ (hạn 5 phút)
const otpStore = new Map<string, { otp: string; expiresAt: number; name: string }>();

// API gửi mã OTP về email đăng ký
app.post(['/api/auth/send-otp', '/api/gui-otp'], async (req, res) => {
  const { email, ho_ten } = req.body ?? {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ message: 'Vui lòng cung cấp địa chỉ email hợp lệ để nhận mã OTP.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(cleanEmail, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 phút
    name: String(ho_ten || 'Quý khách'),
  });

  const sendRes = await sendOtpEmail(cleanEmail, otp, String(ho_ten || 'Quý khách'));
  res.json({
    ok: true,
    message: `Mã xác thực OTP đã được gửi về email ${cleanEmail}. Vui lòng kiểm tra hộp thư đến.`,
    sendResult: sendRes,
  });
});

app.post(['/api/dang-ky', '/api/auth/register'], (req, res) => {
  const { ho_ten, sdt, email, mat_khau, vai_tro, otp } = req.body ?? {};
  if (!ho_ten || !sdt) {
    return res.status(400).json({ message: 'Vui lòng cung cấp họ tên và số điện thoại.' });
  }

  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  const cleanPhone = String(sdt).trim();

  // Kiểm tra trùng lặp email nếu có
  if (cleanEmail && dashboardData.users.some((u) => u.email && u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ message: 'Địa chỉ email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.' });
  }

  // Nếu người dùng có nhập email -> Bắt buộc xác thực mã OTP
  if (cleanEmail.length > 0) {
    const stored = otpStore.get(cleanEmail);

    if (!stored || stored.otp !== String(otp || '').trim() || Date.now() > stored.expiresAt) {
      return res.status(400).json({
        message: 'Mã xác thực OTP không chính xác hoặc đã hết hạn (5 phút). Vui lòng kiểm tra email hoặc nhấn Gửi lại OTP.',
        invalidOtp: true,
      });
    }

    // Đã xác thực thành công -> giải phóng OTP khỏi bộ nhớ
    otpStore.delete(cleanEmail);
  }

  const newUser = {
    id: dashboardData.users.length + 1,
    name: String(ho_ten),
    email: String(email || ''),
    phone: String(sdt),
    password: hashPassword(String(mat_khau || '123456')), // Mã hóa mật khẩu an toàn
    role: (vai_tro || 'GUEST') as any,
  };
  dashboardData.users.push(newUser);
  persistStore(); // Lưu vĩnh viễn xuống đĩa
  res.status(201).json({ ok: true, message: 'Đăng ký tài khoản thành công.', user: newUser });
});

// ==========================================
// 2. SÂN VÀ BÀN
// ==========================================
app.get('/api/tables', (_req, res) => res.json(dashboardData.tables));
app.get('/api/ban', (_req, res) => res.json(dashboardData.tables));
app.get('/api/ban/ban-do', (_req, res) => res.json({ tables: dashboardData.tables, bookings: dashboardData.bookings, classes: dashboardData.classes }));

// ==========================================
// 3. ĐẶT BÀN & KIỂM TRA CHỐNG TRÙNG GIỜ
// ==========================================
export const isTableAvailableAtInterval = (tableNumber: number, startTimeStr: string, durationHours: number): boolean => {
  const reqStart = new Date(startTimeStr).getTime();
  const reqEnd = reqStart + durationHours * 3600000;
  const reqDate = new Date(startTimeStr);
  const startHour = reqDate.getHours() + reqDate.getMinutes() / 60;

  // Bàn khu dạy học (1-4) chỉ mở cho khách sau classCutoffHour (19h)
  const isTeachingZone = tableNumber >= 1 && tableNumber <= 4;
  if (isTeachingZone && startHour < dashboardData.config.classCutoffHour) {
    return false;
  }

  // 1. Kiểm tra xung đột với các booking khác (PENDING, CONFIRMED, CHECKED_IN)
  const hasBookingConflict = dashboardData.bookings.some((b) => {
    if (b.tableId !== tableNumber) return false;
    if (['CANCELLED', 'CHECKED_OUT'].includes(b.status)) return false;
    const bStart = new Date(b.startTime).getTime();
    const bEnd = bStart + b.duration * 3600000;
    return !(reqEnd <= bStart || reqStart >= bEnd);
  });
  if (hasBookingConflict) return false;

  // 2. Kiểm tra xung đột với lớp học đã duyệt của giáo viên
  const reqDateStr = reqDate.toDateString();
  const hasClassConflict = dashboardData.classes.some((c) => {
    if (c.status !== 'approved') return false;
    if (!c.tables.includes(tableNumber)) return false;
    if (new Date(c.date).toDateString() !== reqDateStr) return false;
    const endHour = startHour + durationHours;
    return !(endHour <= c.startHour || startHour >= c.endHour);
  });

  return !hasClassConflict;
};

const handleBookingCreation = (req: express.Request, res: express.Response) => {
  const body = req.body ?? {};
  const bookingType = (body.type || body.loai || 'WALK_IN') as 'WALK_IN' | 'MEMBER' | 'TEACHER';
  const startTime = new Date(body.startTime || body.bat_dau || Date.now()).toISOString();
  const duration = Number(body.duration || body.thoi_luong || 2);
  const people = Number(body.people || body.so_nguoi || 2);

  // Chặn khách tháng hết lượt
  if (bookingType === 'MEMBER') {
    const member = body.memberId
      ? dashboardData.members.find((m) => m.id === body.memberId)
      : dashboardData.members.find((m) => m.phone === body.phone);
    if (member) {
      const leftTurns = member.totalTurns - member.usedTurns;
      if (leftTurns <= 0) {
        return res.status(400).json({
          message: 'Khách tháng đã hết lượt chơi trong kỳ (0 lượt còn lại). Vui lòng gia hạn gói để tiếp tục hoặc chuyển sang đặt theo hình thức khách vãng lai.',
          needRenew: true,
        });
      }
    }
  }

  // Tìm bàn trống theo thuật toán chống trùng giờ thực tế
  let assignedTableId = Number(body.tableId || body.ban_id || 0);
  if (!assignedTableId || assignedTableId <= 0) {
    // Ưu tiên quét khu khách (5 - 16), sau 19h quét thêm khu dạy học (1 - 4)
    const candidateTableNumbers = [
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      1, 2, 3, 4
    ];
    const found = candidateTableNumbers.find((tNum) => isTableAvailableAtInterval(tNum, startTime, duration));
    if (!found) {
      return res.status(400).json({ message: 'Không còn bàn trống phù hợp trong khung giờ đã chọn.', noTable: true });
    }
    assignedTableId = found;
  } else {
    // Nếu có chỉ định bàn, kiểm tra bàn đó có trống trong khung giờ không
    if (!isTableAvailableAtInterval(assignedTableId, startTime, duration)) {
      return res.status(400).json({ message: `Bàn ${assignedTableId} đã có người đặt hoặc trùng lớp học trong khung giờ này.`, conflict: true });
    }
  }

  const isImmediateCheckIn = Boolean(body.checkInImmediately || body.status === 'CHECKED_IN');
  const booking = {
    id: dashboardData.bookings.length + 1,
    tableId: assignedTableId,
    customerName: String(body.customerName || body.ho_ten || ''),
    phone: String(body.phone || body.sdt || ''),
    email: String(body.email || ''),
    type: bookingType,
    startTime,
    duration,
    people,
    status: (isImmediateCheckIn ? 'CHECKED_IN' : (body.status || 'CONFIRMED')) as any,
    amount: bookingType === 'MEMBER' ? 0 : Number(body.amount || body.tien || (people * duration * dashboardData.config.courtPrice)),
    memberId: body.memberId ?? null,
    checkedInAt: isImmediateCheckIn ? new Date().toISOString() : null,
    checkedOutAt: null,
  };

  dashboardData.bookings.push(booking);

  // Nếu là thời gian hiện tại và check-in ngay
  if (booking.status === 'CHECKED_IN') {
    const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
    if (table) table.status = 'busy';
  }

  // Gửi email xác nhận đặt bàn qua SMTP hoặc ghi outbox
  if (booking.email) {
    sendBookingConfirmationEmail(booking).catch((err) => {
      console.error('[Mailer] Background error sending confirmation email:', err);
    });
  }

  persistStore();
  res.status(201).json(booking);
};

app.get('/api/bookings', (_req, res) => res.json(dashboardData.bookings));
app.post('/api/bookings', handleBookingCreation);
app.post('/api/dat-ban', handleBookingCreation);

app.post('/api/dat-ban/:id/huy', (req, res) => {
  const id = Number(req.params.id);
  const booking = dashboardData.bookings.find((b) => b.id === id);
  if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt.' });
  booking.status = 'CANCELLED';
  const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
  if (table) table.status = 'available';
  res.json({ ok: true, message: `Đã hủy lượt đặt #${id} và giải phóng bàn.` });
});

// ==========================================
// 4. CHECK-IN / CHECK-OUT
// ==========================================
const handleCheckIn = (req: express.Request, res: express.Response) => {
  const rawParam = String(req.params.id || req.body.bookingId || req.body.id || '').trim();
  const numericId = Number(rawParam.replace(/^pb-0*/i, '').replace(/\D/g, '')) || Number(rawParam);
  const booking = dashboardData.bookings.find((b) => b.id === numericId);

  if (!booking) {
    return res.status(404).json({ message: 'Không tìm thấy lượt đặt.' });
  }

  booking.status = 'CHECKED_IN';
  booking.checkedInAt = new Date().toISOString();
  const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
  if (table) {
    table.status = 'busy';
  }

  persistStore();
  res.json({ ok: true, message: `Check-in thành công bàn ${booking.tableId} cho ${booking.customerName}.`, booking });
};

app.post('/api/bookings/:id/checkin', handleCheckIn);
app.post('/api/checkin', handleCheckIn);

const handleCheckOut = (req: express.Request, res: express.Response) => {
  const rawParam = String(req.params.id || req.body.bookingId || req.body.id || '').trim();
  const numericId = Number(rawParam.replace(/^pb-0*/i, '').replace(/\D/g, '')) || Number(rawParam);
  const booking = dashboardData.bookings.find((b) => b.id === numericId);

  if (!booking) {
    return res.status(404).json({ message: 'Không tìm thấy lượt đặt.' });
  }

  booking.status = 'CHECKED_OUT';
  booking.checkedOutAt = new Date().toISOString();
  const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
  if (table) {
    table.status = 'available';
  }

  let finalAmount = 0;
  let message = '';

  if (booking.type === 'WALK_IN') {
    const checkInTime = booking.checkedInAt ? new Date(booking.checkedInAt).getTime() : new Date(booking.startTime).getTime();
    const actualHours = Math.max(1, Math.round(((Date.now() - checkInTime) / 3600000) * 10) / 10);
    const billableHours = Math.max(booking.duration, Math.ceil(actualHours));
    finalAmount = booking.amount > 0 && billableHours === booking.duration ? booking.amount : (booking.people * billableHours * dashboardData.config.courtPrice);
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
    const member = booking.memberId
      ? dashboardData.members.find((m) => m.id === booking.memberId)
      : dashboardData.members.find((m) => m.phone === booking.phone);

    if (member) {
      const checkInTime = booking.checkedInAt ? new Date(booking.checkedInAt).getTime() : new Date(booking.startTime).getTime();
      const actualHours = Math.max(1, Math.round(((Date.now() - checkInTime) / 3600000) * 10) / 10);
      const playHours = Math.max(booking.duration, actualHours);

      // Quy tắc đặc tả: <= 2 tiếng trừ 1 lượt, trên 2 tiếng trừ 2 lượt
      const turnsRequired = playHours <= 2 ? 1 : 2;
      const leftBefore = Math.max(0, member.totalTurns - member.usedTurns);

      if (leftBefore >= turnsRequired) {
        member.usedTurns += turnsRequired;
        const leftAfter = Math.max(0, member.totalTurns - member.usedTurns);
        if (leftAfter <= 0) member.status = 'expired';
        else if (leftAfter <= 5) member.status = 'warning';
        message = `Check-out thành công. Khách tháng đã trừ ${turnsRequired} lượt (${playHours} giờ chơi), còn ${leftAfter}/${member.totalTurns} lượt. Không thu tiền mặt.`;
      } else if (leftBefore > 0) {
        // Không đủ lượt: trừ hết số lượt còn lại (mỗi lượt 2 giờ) và phụ thu thời gian vượt gói
        const coveredHours = leftBefore * 2;
        const uncoveredHours = Math.max(0, playHours - coveredHours);
        member.usedTurns += leftBefore;
        member.status = 'expired';

        const extraAmount = Math.round(booking.people * uncoveredHours * dashboardData.config.courtPrice);
        finalAmount = extraAmount;
        if (extraAmount > 0) {
          dashboardData.payments.push({
            id: dashboardData.payments.length + 1,
            type: 'tien_choi',
            amount: extraAmount,
            reference: `Phụ thu vượt gói: Bàn ${booking.tableId} · ${booking.customerName} (${uncoveredHours}h)`,
            who: 'Nhân viên quầy',
            createdAt: new Date().toISOString(),
          });
        }
        message = `Check-out thành công. Khách tháng đã dùng ${leftBefore} lượt còn lại. Thu phụ phí ngoài gói ${uncoveredHours} giờ: ${extraAmount.toLocaleString('vi-VN')}đ.`;
      } else {
        // Khách tháng hết lượt (0 lượt): tính tiền như khách vãng lai
        const fullAmount = Math.round(booking.people * playHours * dashboardData.config.courtPrice);
        finalAmount = fullAmount;
        dashboardData.payments.push({
          id: dashboardData.payments.length + 1,
          type: 'tien_choi',
          amount: fullAmount,
          reference: `Bàn ${booking.tableId} · ${booking.customerName} (Khách tháng 0 lượt)`,
          who: 'Nhân viên quầy',
          createdAt: new Date().toISOString(),
        });
        message = `Khách tháng đã hết lượt (0 lượt). Thu tiền theo giá thông thường: ${fullAmount.toLocaleString('vi-VN')}đ.`;
      }
    } else {
      message = 'Check-out thành công cho khách tháng.';
    }
  } else if (booking.type === 'TEACHER') {
    message = 'Check-out lớp dạy thành công. Ghi nhận 1 lượt dạy (250.000đ) vào bảng tổng hợp cuối tháng.';
  }

  // Phân bổ bàn cho hàng chờ nếu có
  const waitIndex = dashboardData.bookings.findIndex((b) => b.status === 'PENDING');
  if (waitIndex !== -1 && table) {
    const nextWait = dashboardData.bookings[waitIndex];
    nextWait.tableId = table.tableNumber;
    nextWait.status = 'CONFIRMED';
    table.status = 'busy';
  }

  persistStore();
  res.json({ ok: true, amount: finalAmount, message, booking });
};

app.post('/api/bookings/:id/checkout', handleCheckOut);
app.post('/api/checkout', handleCheckOut);

// ==========================================
// 5. HÀNG CHỜ (WAITLIST)
// ==========================================
const handleWaitlist = (req: express.Request, res: express.Response) => {
  const body = req.body ?? {};
  const waitItem = {
    id: dashboardData.bookings.length + 1,
    tableId: 0,
    customerName: String(body.customerName || body.ho_ten || ''),
    phone: String(body.phone || body.sdt || ''),
    email: String(body.email || ''),
    type: (body.type || body.loai || 'WALK_IN') as any,
    startTime: new Date(body.startTime || body.bat_dau || Date.now()).toISOString(),
    duration: Number(body.duration || body.thoi_luong || 2),
    people: Number(body.people || body.so_nguoi || 2),
    status: 'PENDING' as const,
    amount: 0,
    memberId: body.memberId ?? null,
  };

  dashboardData.bookings.push(waitItem);
  res.status(201).json(waitItem);
};

app.post('/api/waitlist', handleWaitlist);
app.post('/api/hang-cho', handleWaitlist);

app.post('/api/hang-cho/:id/xac-nhan', (req, res) => {
  const id = Number(req.params.id);
  const booking = dashboardData.bookings.find((b) => b.id === id && b.status === 'PENDING');
  if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt chờ.' });

  const available = dashboardData.tables.find((t) => t.status === 'available');
  if (!available) return res.status(400).json({ message: 'Chưa có bàn trống để gán cho khách.' });

  booking.tableId = available.tableNumber;
  booking.status = 'CONFIRMED';
  available.status = 'busy';
  res.json({ ok: true, message: `Đã phân bổ Bàn ${available.tableNumber} cho khách ${booking.customerName}.`, booking });
});

// ==========================================
// 6. LỚP HỌC & DUYỆT LỚP
// ==========================================
const handleClassCreation = (req: express.Request, res: express.Response) => {
  const body = req.body ?? {};
  const startHour = Number(body.startHour ?? body.bat_dau ?? 10);
  const endHour = startHour + 2;

  if (startHour < dashboardData.config.openingHour || endHour > dashboardData.config.classCutoffHour) {
    return res.status(400).json({ message: `Lớp học chỉ được đăng ký từ ${dashboardData.config.openingHour}:00 đến trước ${dashboardData.config.classCutoffHour}:00.` });
  }

  const sessionDateStr = new Date(body.date ?? body.ngay ?? Date.now()).toDateString();
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
    teacherName: String(body.teacherName ?? body.giao_vien_ten ?? 'Giáo viên'),
    date: new Date(body.date ?? body.ngay ?? Date.now()).toISOString(),
    startHour,
    endHour,
    tables: allocatedTables,
    status: 'pending' as const,
  };

  dashboardData.classes.push(newClass);
  res.status(201).json({ ok: true, message: `Đã đăng ký lớp học (${allocatedTables.join(', ')}). Chờ duyệt.`, classSession: newClass });
};

app.get('/api/classes', (_req, res) => res.json(dashboardData.classes));
app.post('/api/classes', handleClassCreation);
app.post('/api/lop-hoc', handleClassCreation);

const handleClassApprove = (req: express.Request, res: express.Response) => {
  const id = Number(req.params.id);
  const session = dashboardData.classes.find((c) => c.id === id);
  if (!session) return res.status(404).json({ message: 'Không tìm thấy lớp học.' });

  const conflict = dashboardData.classes.find(
    (c) =>
      c.id !== id &&
      c.status === 'approved' &&
      new Date(c.date).toDateString() === new Date(session.date).toDateString() &&
      c.tables.some((t) => session.tables.includes(t)) &&
      !(session.endHour <= c.startHour || session.startHour >= c.endHour)
  );

  if (conflict) {
    return res.status(400).json({ message: `Xung đột lịch với lớp học đã duyệt của ${conflict.teacherName}.` });
  }

  session.status = 'approved';
  persistStore();
  res.json({ ok: true, message: `Đã duyệt lớp học thành công cho ${session.teacherName}.`, session });
};

app.post('/api/classes/:id/approve', handleClassApprove);
app.post('/api/lop-hoc/:id/duyet', handleClassApprove);

app.post(['/api/classes/:id/reject', '/api/lop-hoc/:id/tu-choi'], (req, res) => {
  const id = Number(req.params.id);
  const session = dashboardData.classes.find((c) => c.id === id);
  if (!session) return res.status(404).json({ message: 'Không tìm thấy lớp học.' });
  const reason = String(req.body?.reason || req.body?.lyDo || 'Lịch sân không phù hợp').trim();
  session.status = 'rejected';
  session.rejectReason = reason;
  persistStore();
  res.json({ ok: true, message: `Đã từ chối lớp học của ${session.teacherName}. Lý do: ${reason}`, session });
});

// Check-in lớp học (Quản lý hoặc Nhân viên)
app.post(['/api/classes/:id/checkin', '/api/lop-hoc/:id/checkin'], (req, res) => {
  const id = Number(req.params.id);
  const session = dashboardData.classes.find((c) => c.id === id);
  if (!session) return res.status(404).json({ message: 'Không tìm thấy lớp học.' });
  if (session.status !== 'approved') {
    return res.status(400).json({ message: 'Chỉ có thể check-in cho lớp học đã được phê duyệt.' });
  }
  session.checkedInAt = new Date().toISOString();
  // Cập nhật trạng thái các bàn của lớp học sang 'busy'
  session.tables.forEach((tNum) => {
    const table = dashboardData.tables.find((t) => t.tableNumber === tNum);
    if (table) table.status = 'busy';
  });
  persistStore();
  res.json({ ok: true, message: `Check-in thành công cho lớp học của ${session.teacherName} (Bàn ${session.tables.join(', ')}).`, session });
});

// Check-out lớp học (Quản lý, Nhân viên hoặc Giáo viên)
app.post(['/api/classes/:id/checkout', '/api/lop-hoc/:id/checkout'], (req, res) => {
  const id = Number(req.params.id);
  const session = dashboardData.classes.find((c) => c.id === id);
  if (!session) return res.status(404).json({ message: 'Không tìm thấy lớp học.' });
  if (!session.checkedInAt) {
    session.checkedInAt = new Date().toISOString();
  }
  session.checkedOutAt = new Date().toISOString();
  // Giải phóng các bàn của lớp học sang 'available'
  session.tables.forEach((tNum) => {
    const table = dashboardData.tables.find((t) => t.tableNumber === tNum);
    if (table) table.status = 'available';
  });
  persistStore();
  recordAuditLog(
    'TEACHER',
    session.teacherName || 'Giáo viên',
    'Check-out lớp học',
    `Check-out lớp học #${session.id} của giáo viên ${session.teacherName}. Đã giải phóng bàn ${session.tables.join(', ')}.`
  );
  res.json({ ok: true, message: `Check-out hoàn tất cho lớp học của ${session.teacherName}. Bàn ${session.tables.join(', ')} đã được giải phóng.`, session });
});

// ==========================================
// 7. KHÁCH THÁNG & GIA HẠN GÓI CỘNG DỒN LƯỢT
// ==========================================
app.get('/api/members', (_req, res) => res.json(dashboardData.members));
app.get('/api/khach-thang', (_req, res) => res.json(dashboardData.members));

// Đăng ký / Kích hoạt gói tháng mới cho khách hàng (Quản lý hoặc Nhân viên thực hiện tại quầy)
const handleActivateMember = (req: express.Request, res: express.Response) => {
  const { customerName, phone, email, packageId, staffName } = req.body ?? {};
  if (!customerName || !phone) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên và số điện thoại của khách hàng.' });
  }

  const selectedPackage = String(packageId || 'p1');
  const packConfig: Record<string, { months: number; price: number; turns: number; name: string }> = {
    p1: { months: 1, price: 449000, turns: 30, name: 'Gói 1 tháng' },
    p3: { months: 3, price: 1149000, turns: 90, name: 'Gói 3 tháng' },
    p6: { months: 6, price: 1999000, turns: 180, name: 'Gói 6 tháng' },
  };
  const pack = packConfig[selectedPackage] || packConfig['p1'];

  const cleanPhone = String(phone).trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  // Kiểm tra nếu khách đã có gói tháng đang hoạt động
  const existingMember = dashboardData.members.find(
    (m) => m.phone === cleanPhone || (cleanEmail && m.email === cleanEmail)
  );

  if (existingMember && existingMember.status === 'active' && existingMember.totalTurns - existingMember.usedTurns > 0) {
    return res.status(400).json({
      message: `Khách hàng ${existingMember.name} (${existingMember.phone}) hiện đang có gói tháng còn ${existingMember.totalTurns - existingMember.usedTurns} lượt chơi. Vui lòng sử dụng chức năng "Gia hạn gói" để cộng dồn lượt!`,
    });
  }

  const newMemberId = dashboardData.members.length > 0 ? Math.max(...dashboardData.members.map((m) => m.id)) + 1 : 1;
  const newMember = {
    id: newMemberId,
    name: String(customerName).trim(),
    phone: cleanPhone,
    email: cleanEmail,
    packageType: selectedPackage,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + pack.months * 30 * 86400000).toISOString(),
    totalTurns: pack.turns,
    usedTurns: 0,
    status: 'active' as const,
  };

  dashboardData.members.push(newMember);

  // Tự động tìm và nâng cấp tài khoản người dùng thành MEMBER
  // Ưu tiên 1: Khớp chính xác theo Email (dành cho tài khoản khách hàng GUEST)
  let matchedUser = cleanEmail
    ? dashboardData.users.find((u) => u.email.toLowerCase() === cleanEmail && (u.role === 'GUEST' || u.role === 'MEMBER'))
    : undefined;

  // Ưu tiên 2: Nếu chưa tìm thấy theo email, tìm theo SĐT nhưng CHỈ áp dụng cho tài khoản khách (GUEST / MEMBER)
  // Tuyệt đối không bao giờ ghi đè hoặc hạ cấp tài khoản Nhân viên (STAFF) hoặc Quản lý (MANAGER)
  if (!matchedUser) {
    matchedUser = dashboardData.users.find(
      (u) => u.phone === cleanPhone && (u.role === 'GUEST' || u.role === 'MEMBER')
    );
  }

  if (matchedUser) {
    matchedUser.role = 'MEMBER';
    matchedUser.memberId = newMemberId;
    if (!matchedUser.password) {
      matchedUser.password = hashPassword('123456');
      matchedUser.firstLogin = true;
    }
    recordAuditLog(
      String(staffName || 'quầy'),
      'STAFF',
      'UPGRADE_GUEST_TO_MEMBER',
      `Khách hàng ${matchedUser.name} (${matchedUser.phone}) đăng ký gói ${pack.name}. Tự động chuyển loại tài khoản sang Khách tháng, toàn bộ dữ liệu cá nhân, lịch sử đặt bàn và giao dịch được giữ nguyên.`
    );
  } else {
    // Chưa có tài khoản: Tạo mới tài khoản khách tháng với mật khẩu mặc định 123456 (đã mã hóa) và kích hoạt firstLogin
    const newUserId = dashboardData.users.length > 0 ? Math.max(...dashboardData.users.map((u) => u.id)) + 1 : 1;
    const createdUser: User = {
      id: newUserId,
      name: newMember.name,
      phone: newMember.phone,
      email: newMember.email || `${cleanPhone}@pingpongbros.customer`,
      password: hashPassword('123456'), // Mã hóa an toàn scrypt
      role: 'MEMBER',
      memberId: newMemberId,
      firstLogin: true, // Kích hoạt bắt buộc đổi mật khẩu lần đầu
    };
    dashboardData.users.push(createdUser);
    matchedUser = createdUser;
    recordAuditLog(
      String(staffName || 'quầy'),
      'STAFF',
      'CREATE_MEMBER_ACCOUNT',
      `Tạo mới tài khoản khách tháng cho ${createdUser.name} (${createdUser.phone}) khi đăng ký ${pack.name}. Mật khẩu mặc định 123456 đã được mã hóa, firstLogin=true.`
    );
  }

  // Ghi nhận thanh toán tiền gói vào hệ thống
  dashboardData.payments.push({
    id: dashboardData.payments.length + 1,
    type: 'goi',
    amount: pack.price,
    reference: `Đăng ký mới ${pack.name} · ${newMember.name} (${newMember.phone})`,
    who: String(staffName || 'Nhân viên quầy'),
    createdAt: new Date().toISOString(),
  });

  persistStore(); // Lưu dữ liệu vĩnh viễn

  res.status(201).json({
    ok: true,
    message: `Kích hoạt thành công ${pack.name} cho khách hàng ${newMember.name}! Đã nạp ${pack.turns} lượt chơi vào thẻ hội viên.`,
    member: newMember,
    upgradedUser: matchedUser ? { name: matchedUser.name, email: matchedUser.email, role: matchedUser.role } : null,
  });
};

app.post('/api/members/activate', handleActivateMember);
app.post('/api/members', handleActivateMember);
app.post('/api/khach-thang/dang-ky', handleActivateMember);

// Cấp tài khoản Nhân viên (STAFF) do Quản trị viên thực hiện
const handleCreateStaff = (req: express.Request, res: express.Response) => {
  const { name, phone, email, password } = req.body ?? {};
  if (!name || !phone || !email || !password) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ họ tên, số điện thoại, email và mật khẩu của nhân viên.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPhone = String(phone).trim();

  // Kiểm tra trùng lặp email hoặc số điện thoại
  const isDuplicate = dashboardData.users.some(
    (u) => u.email.toLowerCase() === cleanEmail || u.phone === cleanPhone
  );
  if (isDuplicate) {
    return res.status(400).json({ message: 'Email hoặc số điện thoại này đã được sử dụng trong hệ thống.' });
  }

  const newUserId = dashboardData.users.length > 0 ? Math.max(...dashboardData.users.map((u) => u.id)) + 1 : 1;
  const newStaff = {
    id: newUserId,
    name: String(name).trim(),
    phone: cleanPhone,
    email: cleanEmail,
    password: hashPassword(String(password).trim()), // Mã hóa mật khẩu Scrypt
    role: 'STAFF' as const,
  };

  dashboardData.users.push(newStaff);
  persistStore(); // Lưu dữ liệu vĩnh viễn

  const { password: _p, ...safeStaff } = newStaff;
  res.status(201).json({
    ok: true,
    message: `Đã cấp thành công tài khoản Nhân viên cho ${newStaff.name} với email ${newStaff.email}!`,
    user: safeStaff,
  });
};

app.post('/api/staff', handleCreateStaff);
app.post('/api/users/staff', handleCreateStaff);
app.get('/api/staff', (_req, res) => {
  const staffList = dashboardData.users
    .filter((u) => u.role === 'STAFF')
    .map(({ password: _p, ...safeUser }) => safeUser);
  res.json(staffList);
});

const handleRenewMember = (req: express.Request, res: express.Response) => {
  const id = Number(req.params.id);
  const { packageId, goi_id } = req.body ?? {};
  const selectedPackage = packageId || goi_id || 'p1';
  const member = dashboardData.members.find((m) => m.id === id);
  if (!member) return res.status(404).json({ message: 'Không tìm thấy hội viên.' });

  const packConfig: Record<string, { months: number; price: number; turns: number; name: string }> = {
    p1: { months: 1, price: 449000, turns: 30, name: 'Gói 1 tháng' },
    p3: { months: 3, price: 1149000, turns: 90, name: 'Gói 3 tháng' },
    p6: { months: 6, price: 1999000, turns: 180, name: 'Gói 6 tháng' },
  };

  const pack = packConfig[selectedPackage] || packConfig['p1'];

  member.totalTurns += pack.turns; // CỘNG DỒN LƯỢT
  member.packageType = selectedPackage;
  member.status = 'active';

  const currentEnd = new Date(member.endDate) > new Date() ? new Date(member.endDate) : new Date();
  currentEnd.setDate(currentEnd.getDate() + pack.months * 30);
  member.endDate = currentEnd.toISOString();

  dashboardData.payments.push({
    id: dashboardData.payments.length + 1,
    type: 'goi',
    amount: pack.price,
    reference: `Gia hạn ${pack.name} · ${member.name}`,
    who: 'Nhân viên quầy',
    createdAt: new Date().toISOString(),
  });

  const remaining = member.totalTurns - member.usedTurns;
  persistStore(); // Lưu dữ liệu vĩnh viễn
  res.json({
    ok: true,
    message: `Gia hạn ${pack.name} thành công cho ${member.name}. Tổng lượt mới: ${remaining}/${member.totalTurns} lượt.`,
    member,
  });
};

app.post('/api/members/:id/renew', handleRenewMember);
app.post('/api/khach-thang/:id/gia-han', handleRenewMember);

// ==========================================
// 8. THỐNG KÊ DOANH THU & GIỜ CAO ĐIỂM
// ==========================================
app.get('/api/payments', (_req, res) => res.json(dashboardData.payments));

// API Báo cáo Doanh thu - Kiểm tra quyền nghiêm ngặt (Mục 3)
// Nhân viên: CHỈ ĐƯỢC XEM HÔM NAY. Không được xem tuần, tháng, quý, năm, tổng hợp -> 403 Forbidden
// Quản lý: Được xem toàn bộ (ngày, tuần, tháng, quý, năm, tổng hợp)
app.get(['/api/thong-ke/doanh-thu', '/api/reports/revenue'], (req, res) => {
  const role = String(req.query.role || req.headers['x-user-role'] || 'GUEST');
  const period = String(req.query.period || 'today').toLowerCase();

  // Khách vãng lai, Khách tháng, Giáo viên: TUYỆT ĐỐI BỊ CHẶN
  if (role === 'GUEST' || role === 'MEMBER' || role === 'TEACHER') {
    return res.status(403).json({
      ok: false,
      message: 'Quyền truy cập bị từ chối: Tài khoản của bạn không được phép xem thông tin doanh thu của câu lạc bộ.',
    });
  }

  // Nhân viên: CHỈ ĐƯỢC XEM DOANH THU TRONG NGÀY
  if (role === 'STAFF') {
    if (period !== 'today') {
      return res.status(403).json({
        ok: false,
        message: 'Quyền truy cập bị từ chối: Theo quy định bảo mật, Nhân viên chỉ được xem doanh thu trong ngày hiện tại. Không được xem doanh thu theo tuần, tháng, quý, năm hoặc báo cáo tổng hợp.',
      });
    }
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const payments = dashboardData.payments || [];

  const todayPayments = payments.filter((p) => p.createdAt && p.createdAt.slice(0, 10) === todayStr);
  const todayRev = todayPayments.reduce((s, p) => s + p.amount, 0);

  if (period === 'today') {
    return res.json({
      ok: true,
      period: 'today',
      revenue: todayRev,
      transactionCount: todayPayments.length,
      payments: todayPayments,
    });
  }

  // Quản lý (MANAGER) được tính toán và xem toàn bộ các kỳ
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  const weekPayments = payments.filter((p) => new Date(p.createdAt) >= startOfWeek);
  const weekRev = weekPayments.reduce((s, p) => s + p.amount, 0);

  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const monthPayments = payments.filter((p) => {
    const d = new Date(p.createdAt);
    return d.getMonth() === curMonth && d.getFullYear() === curYear;
  });
  const monthRev = monthPayments.reduce((s, p) => s + p.amount, 0);

  // Quý hiện tại (Q1: 0-2, Q2: 3-5, Q3: 6-8, Q4: 9-11)
  const curQuarter = Math.floor(curMonth / 3);
  const quarterPayments = payments.filter((p) => {
    const d = new Date(p.createdAt);
    return Math.floor(d.getMonth() / 3) === curQuarter && d.getFullYear() === curYear;
  });
  const quarterRev = quarterPayments.reduce((s, p) => s + p.amount, 0);

  // Năm hiện tại
  const yearPayments = payments.filter((p) => new Date(p.createdAt).getFullYear() === curYear);
  const yearRev = yearPayments.reduce((s, p) => s + p.amount, 0);

  const totalRev = payments.reduce((s, p) => s + p.amount, 0);

  let selectedPayments = payments;
  let selectedRev = totalRev;
  if (period === 'week') { selectedPayments = weekPayments; selectedRev = weekRev; }
  else if (period === 'month') { selectedPayments = monthPayments; selectedRev = monthRev; }
  else if (period === 'quarter') { selectedPayments = quarterPayments; selectedRev = quarterRev; }
  else if (period === 'year') { selectedPayments = yearPayments; selectedRev = yearRev; }

  return res.json({
    ok: true,
    period,
    revenue: selectedRev,
    transactionCount: selectedPayments.length,
    payments: selectedPayments,
    summary: {
      today: todayRev,
      week: weekRev,
      month: monthRev,
      quarter: quarterRev,
      year: yearRev,
      total: totalRev,
    },
  });
});

// API Xuất báo cáo Doanh thu - Chỉ dành cho Quản lý (Mục 3)
app.post(['/api/reports/export', '/api/thong-ke/xuat-bao-cao'], (req, res) => {
  const role = req.body?.role || req.headers['x-user-role'];
  if (role !== 'MANAGER') {
    return res.status(403).json({
      ok: false,
      message: 'Quyền truy cập bị từ chối: Tính năng xuất báo cáo doanh thu chỉ dành riêng cho Quản lý. Nhân viên không có quyền thực hiện.',
    });
  }

  recordAuditLog(
    req.body?.email || 'admin@pingpongbros.vn',
    'MANAGER',
    'EXPORT_REVENUE_REPORT',
    'Quản lý đã xuất file báo cáo doanh thu hệ thống.'
  );

  res.json({ ok: true, message: 'Cho phép xuất báo cáo thành công.' });
});

// API Đổi mật khẩu lần đăng nhập đầu tiên (Mục 6)
app.post('/api/auth/first-login-change-password', (req, res) => {
  const { userId, email, oldPassword, newPassword } = req.body ?? {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.' });
  }

  if (newPassword === '123456') {
    return res.status(400).json({ message: 'Vui lòng chọn mật khẩu mới khác mật khẩu mặc định 123456.' });
  }

  const user = dashboardData.users.find(
    (u) => (userId && u.id === Number(userId)) || (email && u.email.toLowerCase() === String(email).toLowerCase())
  );

  if (!user) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản người dùng.' });
  }

  if (user.password && oldPassword && !verifyPassword(String(oldPassword), user.password)) {
    return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.' });
  }

  // Mã hóa mật khẩu mới trước khi lưu trữ
  user.password = hashPassword(String(newPassword));
  user.firstLogin = false; // Hủy trạng thái bắt buộc đổi mật khẩu

  persistStore();

  recordAuditLog(
    user.email,
    user.role,
    'FIRST_LOGIN_CHANGE_PASSWORD',
    `Người dùng ${user.name} (${user.email}) đã đổi mật khẩu thành công ở lần đăng nhập đầu tiên. Mật khẩu mới đã được mã hóa.`
  );

  const { password: _p, ...safeUser } = user;
  const token = createJwtToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  res.json({
    ok: true,
    message: 'Đổi mật khẩu thành công! Bạn có thể sử dụng hệ thống bình thường.',
    user: safeUser,
    token,
  });
});

// API Tạo tài khoản khách tháng (Mục 4 & Mục 7)
// Người được phép tạo: Quản lý hoặc Nhân viên
// Mật khẩu mặc định: 123456 (đã mã hóa)
// Trạng thái firstLogin = true
app.post(['/api/users/member', '/api/khach-thang/tai-khoan'], (req, res) => {
  const { name, phone, email, packageId, staffEmail, staffRole } = req.body ?? {};
  const requesterRole = staffRole || req.headers['x-user-role'] || 'GUEST';

  if (requesterRole !== 'MANAGER' && requesterRole !== 'STAFF') {
    return res.status(403).json({
      ok: false,
      message: 'Quyền truy cập bị từ chối: Chỉ Quản lý và Nhân viên mới có quyền tạo tài khoản khách tháng.',
    });
  }

  if (!name || !phone) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên và số điện thoại của khách hàng.' });
  }

  const cleanPhone = String(phone).trim();
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';

  // Mục 7: Chuyển đổi khách vãng lai thành khách tháng - KHÔNG ĐƯỢC TẠO TÀI KHOẢN MỚI
  let existingUser = cleanEmail
    ? dashboardData.users.find((u) => u.email.toLowerCase() === cleanEmail)
    : undefined;
  if (!existingUser) {
    existingUser = dashboardData.users.find((u) => u.phone === cleanPhone);
  }

  let user: User;
  let isUpgrade = false;

  if (existingUser) {
    // Giữ nguyên 100% dữ liệu cá nhân, lịch sử đặt bàn, thanh toán
    existingUser.role = 'MEMBER';
    if (!existingUser.password) {
      existingUser.password = hashPassword('123456');
      existingUser.firstLogin = true;
    }
    user = existingUser;
    isUpgrade = true;
  } else {
    // Tạo tài khoản mới: gán mật khẩu mặc định 123456 ĐÃ ĐƯỢC MÃ HÓA, firstLogin = true
    const newId = dashboardData.users.length > 0 ? Math.max(...dashboardData.users.map((u) => u.id)) + 1 : 1;
    user = {
      id: newId,
      name: String(name).trim(),
      phone: cleanPhone,
      email: cleanEmail || `${cleanPhone}@pingpongbros.customer`,
      password: hashPassword('123456'), // Mật khẩu bắt buộc mã hóa
      role: 'MEMBER',
      firstLogin: true, // Bắt buộc đổi mật khẩu lần đầu
    };
    dashboardData.users.push(user);
  }

  // Tạo hoặc liên kết gói hội viên
  let memberObj = dashboardData.members.find((m) => m.phone === cleanPhone || (cleanEmail && m.email === cleanEmail));
  const selectedPackage = String(packageId || 'p1');
  const packConfig: Record<string, { months: number; price: number; turns: number; name: string }> = {
    p1: { months: 1, price: 449000, turns: 30, name: 'Gói 1 tháng' },
    p3: { months: 3, price: 1149000, turns: 90, name: 'Gói 3 tháng' },
    p6: { months: 6, price: 1999000, turns: 180, name: 'Gói 6 tháng' },
  };
  const pack = packConfig[selectedPackage] || packConfig['p1'];

  if (!memberObj) {
    const newMemberId = dashboardData.members.length > 0 ? Math.max(...dashboardData.members.map((m) => m.id)) + 1 : 1;
    memberObj = {
      id: newMemberId,
      name: user.name,
      phone: user.phone,
      email: user.email,
      packageType: selectedPackage,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + pack.months * 30 * 86400000).toISOString(),
      totalTurns: pack.turns,
      usedTurns: 0,
      status: 'active',
    };
    dashboardData.members.push(memberObj);
  }
  user.memberId = memberObj.id;

  persistStore();

  recordAuditLog(
    String(staffEmail || 'staff@pingpongbros.vn'),
    String(requesterRole),
    isUpgrade ? 'UPGRADE_GUEST_TO_MEMBER' : 'CREATE_MEMBER_ACCOUNT',
    `${isUpgrade ? 'Chuyển đổi khách vãng lai thành' : 'Tạo mới tài khoản'} khách tháng cho ${user.name} (${user.phone}). Mật khẩu mặc định 123456 đã được mã hóa an toàn, firstLogin=${user.firstLogin}.`
  );

  const { password: _p, ...safeUser } = user;
  res.status(201).json({
    ok: true,
    message: isUpgrade
      ? `Đã nâng cấp tài khoản của ${user.name} thành Khách tháng, toàn bộ lịch sử giao dịch và dịch vụ được giữ nguyên.`
      : `Đã tạo tài khoản Khách tháng cho ${user.name} với mật khẩu mặc định 123456 (đã mã hóa) và kích hoạt yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.`,
    user: safeUser,
    member: memberObj,
  });
});

// API Chuyển tiếp hội thoại từ Chatbot (Mục 2)
// Khi độ tin cậy < 80%: chuyển cuộc hội thoại sang Nhân viên hỗ trợ (hoặc Quản lý nếu không có nhân viên trực)
// Sau khi chuyển tiếp, Chatbot không được tiếp tục tham gia
// Lưu lịch sử chuyển tiếp: thời gian, mã hội thoại, độ tin cậy, lý do, người tiếp nhận
app.post('/api/ai/transfer-conversation', (req, res) => {
  const { customerId, customerName, customerEmail, customerPhone, customerRole, confidence, reason, messages } = req.body ?? {};

  // Phân cấp chuyển tiếp theo yêu cầu:
  // - Khách hàng (GUEST, MEMBER) và Giáo viên (TEACHER): chuyển cho Nhân viên (STAFF). Nếu không có nhân viên trực, chuyển tiếp Quản lý (MANAGER).
  // - Nhân viên (STAFF): chuyển tiếp trực tiếp cho Quản lý (MANAGER).
  let assignedStaff: any = null;
  if (customerRole === 'STAFF') {
    assignedStaff = dashboardData.users.find((u) => u.role === 'MANAGER');
  } else {
    assignedStaff = dashboardData.users.find((u) => u.role === 'STAFF') || dashboardData.users.find((u) => u.role === 'MANAGER');
  }

  const assignedRole: 'STAFF' | 'MANAGER' = assignedStaff && assignedStaff.role === 'STAFF' ? 'STAFF' : 'MANAGER';
  const assignedTo = {
    id: assignedStaff ? assignedStaff.id : 1,
    name: assignedStaff ? assignedStaff.name : 'Quản Trị Viên',
    role: assignedRole,
    email: assignedStaff ? assignedStaff.email : 'admin@pingpongbros.vn',
  };

  const convId = `CONV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const convRecord: TransferredConversation = {
    id: convId,
    customerId: customerId ? Number(customerId) : undefined,
    customerName: String(customerName || 'Khách hàng'),
    customerEmail: customerEmail ? String(customerEmail) : undefined,
    customerPhone: customerPhone ? String(customerPhone) : undefined,
    customerRole: (customerRole || 'GUEST') as Role,
    transferredAt: new Date().toISOString(),
    confidence: Number(confidence || 0),
    reason: String(reason || 'Độ tin cậy dưới 80%, chuyển tiếp nhân viên hỗ trợ trực tiếp'),
    assignedTo,
    status: 'PENDING',
    messages: Array.isArray(messages) && messages.length > 0
      ? messages.map((m: any, idx: number) => ({
          id: idx + 1,
          sender: m.role === 'assistant' ? 'agent' : 'user',
          senderName: m.role === 'assistant' ? 'AI-3 (Trước khi chuyển)' : (customerName || 'Khách hàng'),
          text: m.text,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        }))
      : [
          {
            id: 1,
            sender: 'system',
            senderName: 'Hệ Thống',
            text: `Cuộc hội thoại được chuyển tiếp tự động vì độ tin cậy đạt ${confidence}% (< 80%). Người tiếp nhận: ${assignedTo.name} (${assignedTo.role === 'STAFF' ? 'Nhân viên hỗ trợ' : 'Quản lý'}). Chatbot đã ngừng tham gia.`,
            time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          },
        ],
  };

  dashboardData.transferredConversations = dashboardData.transferredConversations || [];
  dashboardData.transferredConversations.push(convRecord);
  persistStore();

  recordAuditLog(
    assignedTo.email,
    assignedTo.role,
    'TRANSFER_CONVERSATION',
    `Chuyển tiếp hội thoại ${convId} từ Chatbot đến ${assignedTo.name} (${assignedTo.role}). Khách: ${convRecord.customerName}. Lý do: ${convRecord.reason}. Độ tin cậy: ${confidence}%.`
  );

  res.json({
    ok: true,
    conversationId: convId,
    assignedTo,
    message: `Đã chuyển tiếp cuộc hội thoại đến ${assignedTo.role === 'STAFF' ? 'Nhân viên hỗ trợ' : 'Quản lý'}: ${assignedTo.name}. Chatbot sẽ không tiếp tục tham gia cuộc hội thoại này.`,
    conversation: convRecord,
  });
});

// Lấy danh sách hội thoại chuyển tiếp (Chỉ Nhân viên và Quản lý)
app.get('/api/conversations/transferred', (req, res) => {
  const role = req.query.role || req.headers['x-user-role'];
  if (role !== 'STAFF' && role !== 'MANAGER') {
    return res.status(403).json({
      ok: false,
      message: 'Quyền truy cập bị từ chối: Chỉ Nhân viên và Quản lý mới được xem danh sách hội thoại chuyển tiếp từ chatbot.',
    });
  }

  res.json({
    ok: true,
    total: (dashboardData.transferredConversations || []).length,
    conversations: [...(dashboardData.transferredConversations || [])].reverse(),
  });
});

// Nhân viên / Quản lý phản hồi trực tiếp vào cuộc hội thoại
app.post('/api/conversations/:id/reply', (req, res) => {
  const { id } = req.params;
  const { text, agentName, agentRole } = req.body ?? {};

  const conv = (dashboardData.transferredConversations || []).find((c) => c.id === id);
  if (!conv) {
    return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });
  }

  const newMessage: TransferredMessage = {
    id: conv.messages.length + 1,
    sender: 'agent',
    senderName: String(agentName || 'Chuyên viên hỗ trợ'),
    text: String(text || '').trim(),
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };

  conv.messages.push(newMessage);
  conv.status = 'ACCEPTED';
  persistStore();

  res.json({ ok: true, message: 'Đã gửi phản hồi đến khách hàng thành công.', messageObj: newMessage, conversation: conv });
});

// Khách hàng gửi tin nhắn tiếp theo trong cuộc hội thoại đã chuyển tiếp
app.post('/api/conversations/:id/message', (req, res) => {
  const { id } = req.params;
  const { text, senderName } = req.body ?? {};

  const conv = (dashboardData.transferredConversations || []).find((c) => c.id === id);
  if (!conv) {
    return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });
  }

  const newMessage: TransferredMessage = {
    id: conv.messages.length + 1,
    sender: 'user',
    senderName: String(senderName || conv.customerName || 'Khách hàng'),
    text: String(text || '').trim(),
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };

  conv.messages.push(newMessage);
  persistStore();

  res.json({ ok: true, message: 'Đã gửi tin nhắn đến chuyên viên hỗ trợ.', messageObj: newMessage, conversation: conv });
});

// Hoàn tất cuộc hội thoại chuyển tiếp
app.post('/api/conversations/:id/resolve', (req, res) => {
  const { id } = req.params;
  const conv = (dashboardData.transferredConversations || []).find((c) => c.id === id);
  if (!conv) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });

  conv.status = 'RESOLVED';
  conv.messages.push({
    id: conv.messages.length + 1,
    sender: 'system',
    senderName: 'Hệ Thống',
    text: 'Cuộc hội thoại hỗ trợ đã được đánh dấu hoàn tất. Cảm ơn quý khách!',
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  });

  persistStore();
  res.json({ ok: true, message: 'Đã hoàn tất cuộc hội thoại.', conversation: conv });
});

// Nhân viên chuyển tiếp cuộc hội thoại qua cho Quản lý khi không giải quyết được
app.post('/api/conversations/:id/escalate-to-manager', (req, res) => {
  const { id } = req.params;
  const { staffEmail } = req.body ?? {};

  const conv = (dashboardData.transferredConversations || []).find((c) => c.id === id);
  if (!conv) return res.status(404).json({ message: 'Không tìm thấy cuộc hội thoại.' });

  const manager = dashboardData.users.find((u) => u.role === 'MANAGER') || {
    id: 1,
    name: 'Quản Trị Viên',
    role: 'MANAGER' as const,
    email: 'admin@pingpongbros.vn',
  };

  conv.assignedTo = {
    id: manager.id,
    name: manager.name,
    role: 'MANAGER',
    email: manager.email,
  };
  conv.reason = `${conv.reason} (Nhân viên không giải quyết được, đã chuyển tiếp qua Quản lý)`;

  conv.messages.push({
    id: conv.messages.length + 1,
    sender: 'system',
    senderName: 'Hệ Thống',
    text: `Nhân viên quầy không giải đáp được yêu cầu nên đã chuyển tiếp cuộc hội thoại qua cho Quản lý (${manager.name}) tiếp nhận xử lý.`,
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  });

  persistStore();

  recordAuditLog(
    staffEmail || 'staff@pingpongbros.vn',
    'STAFF',
    'Chuyển tiếp hội thoại qua Quản lý',
    `Nhân viên chuyển tiếp cuộc hội thoại ${conv.id} của ${conv.customerName} (${conv.customerRole}) qua cho Quản lý ${manager.name} tiếp nhận giải quyết.`
  );

  res.json({ ok: true, message: `Đã chuyển tiếp cuộc hội thoại sang Quản lý (${manager.name}).`, conversation: conv });
});

// API Quét hội viên hết hạn (Mục 8)
app.post('/api/khach-thang/sweep-expired', (_req, res) => {
  const expiredIds = sweepExpiredMemberships();
  persistStore();
  res.json({ ok: true, message: `Đã quét và xử lý ${expiredIds.length} gói tháng hết hạn.`, expiredIds });
});

// API Xem Nhật ký Kiểm tra & Truy vết (Audit Log - Mục 9)
app.get('/api/system/audit-logs', (req, res) => {
  const role = req.query.role || req.headers['x-user-role'];
  if (role !== 'MANAGER') {
    return res.status(403).json({
      ok: false,
      message: 'Quyền truy cập bị từ chối: Chỉ Quản lý mới được xem nhật ký kiểm tra và truy vết hệ thống.',
    });
  }

  res.json({
    ok: true,
    total: (dashboardData.auditLogs || []).length,
    logs: [...(dashboardData.auditLogs || [])].reverse(),
  });
});

app.get('/api/thong-ke/gio-cao-diem', (req, res) => {
  const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10));
  const hourCounts: Record<number, number> = {};
  for (let h = dashboardData.config.openingHour; h < dashboardData.config.closingHour; h++) {
    hourCounts[h] = 0;
  }

  dashboardData.bookings.forEach((b) => {
    if (['CANCELLED', 'CHECKED_OUT'].includes(b.status)) return;
    if (!b.startTime.startsWith(dateStr)) return;
    const startH = new Date(b.startTime).getHours();
    for (let h = startH; h < startH + b.duration; h++) {
      if (hourCounts[h] !== undefined) hourCounts[h]++;
    }
  });

  dashboardData.classes.forEach((c) => {
    if (c.status !== 'approved' || !c.date.startsWith(dateStr)) return;
    for (let h = c.startHour; h < c.endHour; h++) {
      if (hourCounts[h] !== undefined) hourCounts[h] += (c.tables?.length || 1);
    }
  });

  const peakHourList = Object.entries(hourCounts)
    .filter(([_, count]) => count >= 12)
    .map(([h]) => `${String(h).padStart(2, '0')}:00`);

  const maxCount = Math.max(...Object.values(hourCounts), 0);
  const status = maxCount >= 12 ? 'high' : maxCount >= 6 ? 'medium' : 'low';
  const peakHour = peakHourList.length > 0 ? peakHourList.join(', ') : '17:00 - 20:00';
  const suggestion = status === 'high' ? 'Bố trí thêm 2 nhân viên quầy' : 'Bố trí 1 nhân viên quầy trực là đảm bảo';

  res.json({ date: dateStr, peakHour, status, suggestion, hourCounts });
});

// ==========================================
// 9. AI ENDPOINTS (AI-1, AI-2, AI-3)
// ==========================================
app.get('/api/ai/du-bao', (req, res) => {
  const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10));
  const hourCounts: Record<number, number> = {};
  for (let h = dashboardData.config.openingHour; h < dashboardData.config.closingHour; h++) {
    hourCounts[h] = 0;
  }

  dashboardData.bookings.forEach((b) => {
    if (['CANCELLED', 'CHECKED_OUT'].includes(b.status)) return;
    if (!b.startTime.startsWith(dateStr)) return;
    const startH = new Date(b.startTime).getHours();
    for (let h = startH; h < startH + b.duration; h++) {
      if (hourCounts[h] !== undefined) hourCounts[h]++;
    }
  });

  let peakHours = Object.entries(hourCounts)
    .filter(([_, count]) => count >= 12)
    .map(([h]) => `${String(h).padStart(2, '0')}:00`);

  if (peakHours.length === 0) {
    peakHours = ['17:00', '18:00', '19:00', '20:00'];
  }

  const maxCount = Math.max(...Object.values(hourCounts), 0);
  const level = maxCount >= 12 ? 'high' : maxCount >= 6 ? 'medium' : 'low';

  res.json({ date: dateStr, peakHours, level, hourCounts });
});

app.post('/api/ai/dat-ban', handleBookingCreation);

app.post('/api/ai/chat', (req, res) => {
  const { message, role, userRole } = req.body ?? {};
  const raw = String(message || '').toLowerCase();
  // BẢO MẬT VÀ KIỂM SOÁT QUYỀN TRUY CẬP (MỤC 4):
  // Chatbot phải xác định vai trò tài khoản trước khi truy xuất và trả lời thông tin.
  // Không được cung cấp dữ liệu vượt quá quyền hạn của từng loại tài khoản.
  const activeRole = (role || userRole || 'GUEST') as 'GUEST' | 'MEMBER' | 'TEACHER' | 'STAFF' | 'MANAGER';

  // 0. Kiểm tra quyền truy xuất dữ liệu Doanh thu & Tài chính nội bộ
  if (/doanh thu|doanh so|doanh_thu|thu nhap|tiền thu|doanh số|thu nhập|doanhthu/.test(raw)) {
    if (activeRole === 'GUEST' || activeRole === 'MEMBER') {
      return res.status(403).json({
        ok: false,
        role: activeRole,
        denied: true,
        message: 'Quyền truy cập bị từ chối: Tài khoản Khách hàng không được phép truy xuất dữ liệu doanh thu của câu lạc bộ. Khách chỉ được hỏi về đặt bàn, giờ mở cửa, giá thuê bàn theo giờ, giá các gói hội viên và thông tin hội viên.',
      });
    }

    if (activeRole === 'TEACHER') {
      return res.status(403).json({
        ok: false,
        role: activeRole,
        denied: true,
        message: 'Quyền truy cập bị từ chối: Tài khoản Giáo viên không được phép xem doanh thu của câu lạc bộ. Giáo viên chỉ được hỏi về giá lớp học, lịch học và đặt bàn phục vụ lớp học.',
      });
    }

    if (activeRole === 'STAFF') {
      if (/tuần|tuan|tháng|thang|quý|quy|năm|nam|toàn thời gian|tổng/.test(raw)) {
        return res.status(403).json({
          ok: false,
          role: activeRole,
          denied: true,
          message: 'Quyền truy cập bị từ chối: Theo quy định bảo mật, tài khoản Nhân viên chỉ được xem doanh thu ngày hiện tại, không được truy xuất doanh thu theo tuần hoặc tháng.',
        });
      }
    }
  }

  // 1. Số người
  let people = 2;
  const pMatch = raw.match(/(\d+)\s*(người|nguoi|ng|bạn|ban|khách|khach)/);
  if (pMatch) people = Math.min(4, Math.max(1, parseInt(pMatch[1], 10)));
  else if (raw.includes('đánh đôi') || raw.includes('danh doi')) people = 4;
  else if (raw.includes('đánh đơn') || raw.includes('danh don')) people = 2;

  // 2. Ngày
  const today = new Date();
  let targetDate = new Date(today);
  const explicitDate = raw.match(/(?:ngày\s+)?(\d{1,2})(?:[\/\-](\d{1,2})(?:[\/\-](\d{4}))?|\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?)/);
  let hasDate = false;
  if (explicitDate) {
    const d = parseInt(explicitDate[1], 10);
    const m = parseInt(explicitDate[2] || explicitDate[4], 10);
    const y = explicitDate[3] || explicitDate[5] ? parseInt(explicitDate[3] || explicitDate[5], 10) : today.getFullYear();
    targetDate = new Date(y, m - 1, d);
    hasDate = true;
  } else if (raw.includes('mai') || raw.includes('ngày mai')) {
    targetDate.setDate(today.getDate() + 1);
    hasDate = true;
  } else if (raw.includes('mốt') || raw.includes('mot') || raw.includes('ngày kia')) {
    targetDate.setDate(today.getDate() + 2);
    hasDate = true;
  } else if (raw.includes('hôm nay') || raw.includes('nay') || raw.includes('tối nay') || raw.includes('chiều nay') || raw.includes('sáng nay')) {
    hasDate = true;
  }
  const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

  // 3. Giờ bắt đầu
  let time = '19:00';
  let hasTime = false;
  const prefixTime = raw.match(/(?:từ|tu|lúc|luc|vào|vao)\s+(\d{1,2})(?::(\d{2})|\s*(?:h|giờ|gio)(?:\s*(\d{2}))?)?\s*(tối|toi|chiều|chieu|sáng|sang|pm|am)?/);
  const suffixTime = raw.match(/(\d{1,2})(?::(\d{2})|\s*(?:h|giờ|gio)(?:\s*(\d{2}))?)\s*(tối|toi|chiều|chieu|sáng|sang|pm|am)/);
  const genericTime = raw.match(/(?<!trong\s|chơi\s|choi\s)(\b(1[0-9]|2[0-2]|[6-9])\s*(?:h|:00)\b)/);

  if (prefixTime) {
    let h = parseInt(prefixTime[1], 10);
    const m = prefixTime[2] || prefixTime[3] ? parseInt(prefixTime[2] || prefixTime[3], 10) : 0;
    const period = prefixTime[4] || '';
    if ((period.includes('tối') || period.includes('toi') || period.includes('chiều') || period.includes('chieu') || period === 'pm') && h < 12) h += 12;
    time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    hasTime = true;
  } else if (suffixTime) {
    let h = parseInt(suffixTime[1], 10);
    const m = suffixTime[2] || suffixTime[3] ? parseInt(suffixTime[2] || suffixTime[3], 10) : 0;
    const period = suffixTime[4] || '';
    if ((period.includes('tối') || period.includes('toi') || period.includes('chiều') || period.includes('chieu') || period === 'pm') && h < 12) h += 12;
    time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    hasTime = true;
  } else if (genericTime) {
    time = `${String(genericTime[2]).padStart(2, '0')}:00`;
    hasTime = true;
  }

  // 4. Thời lượng
  let duration = 2;
  let hasDuration = false;
  const durMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:tiếng|tieng|tiếng đồng hồ)(?!\w)/)
    || raw.match(/(?<!từ\s|tu\s|lúc\s|luc\s|vào\s|vao\s)(\d+(?:\.\d+)?)\s*(?:giờ|gio)(?!\s*(?:tối|toi|chiều|chieu|sáng|sang|am|pm|\d))(?!\w)/);
  if (durMatch) {
    duration = parseFloat(durMatch[1]);
    hasDuration = true;
  }

  // 5. Ngưỡng tin cậy (Confidence threshold >= 80% theo Mục 2)
  let score = 0;
  if (pMatch || raw.includes('đánh đôi') || raw.includes('đánh đơn')) score += 25;
  if (hasDate) score += 25;
  if (hasTime) score += 25;
  if (hasDuration) score += 25;

  const confidence = score;
  const CONFIDENCE_THRESHOLD = 80;

  if (confidence < CONFIDENCE_THRESHOLD) {
    return res.json({
      ok: true,
      confidence,
      transferredToStaff: true,
      message: `Độ tin cậy đạt ${confidence}% (thấp hơn ngưỡng quy định ${CONFIDENCE_THRESHOLD}%). Không có đủ dữ liệu xác thực, hệ thống không tự suy đoán và đã chuyển câu hỏi đến Nhân viên để hỗ trợ giải đáp trực tiếp.`,
    });
  }

  const extracted = {
    date: dateStr,
    people,
    duration,
    time,
    confidence,
  };

  res.json({
    ok: true,
    confidence,
    intent: 'BOOKING_PROPOSAL',
    message: `Đề xuất thông tin đặt bàn (Độ tin cậy ${confidence}%). Người dùng vui lòng kiểm tra và xác nhận qua Form Đặt Bàn.`,
    reply: `Trợ lý AI đã nhận diện ý định đặt bàn: ngày ${dateStr} lúc ${time}, ${people} người chơi trong ${duration} giờ. Nhấn mở Form Đặt Bàn để kiểm tra và xác nhận.`,
    extracted,
  });
});

app.post('/api/scheduler/sweep', (req, res) => {
  const customTime = req.body?.time ? new Date(req.body.time).getTime() : Date.now();
  const cancelled = sweepExpiredBookings(customTime);
  res.json({ ok: true, cancelledBookings: cancelled });
});

// Cấu hình - Chỉ dành cho Quản lý (Mục 3)
app.post('/api/config', (req, res) => {
  const role = req.body?.role || req.headers['x-user-role'];
  if (role && role !== 'MANAGER') {
    return res.status(403).json({ ok: false, message: 'Quyền truy cập bị từ chối: Chỉ Quản lý mới được phép thay đổi cấu hình hệ thống.' });
  }
  dashboardData.config = { ...dashboardData.config, ...req.body };
  persistStore(); // Lưu dữ liệu vĩnh viễn
  res.json({ ok: true, message: 'Đã lưu cấu hình thành công.', config: dashboardData.config });
});

// ==========================================
// 10. SYSTEM STATUS & EMAIL OUTBOX ENDPOINTS
// ==========================================
app.get('/api/system/status', (_req, res) => {
  res.json({
    dbConnected: isDbConnected(),
    dbType: (process.env.DATABASE_URL || '').startsWith('postgres') ? 'Supabase (PostgreSQL)' : 'Microsoft SQL Server (T-SQL)',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/system/emails', (_req, res) => {
  res.json({
    total: getEmailLogs().length,
    outbox: getEmailLogs(),
  });
});

// ==========================================
// 11. PHỤC VỤ GIAO DIỆN FRONTEND (PRODUCTION STATIC SERVING)
// ==========================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

export default app;
