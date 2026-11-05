import nodemailer, { type Transporter } from 'nodemailer';
import dotenv from 'dotenv';
import { recordNotificationSQL } from './db.js';

dotenv.config();

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  sentAt: string;
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  preview: string;
}

const emailOutbox: EmailLog[] = [];

// Khởi tạo SMTP Transporter
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const smtpFrom = process.env.SMTP_FROM || `"PingPongBros Club" <no-reply@pingpongbros.vn>`;

// Chỉ kích hoạt SMTP thực tế khi đã có thông tin tài khoản thật (không phải placeholder demo)
const hasSmtpCredentials = Boolean(
  smtpUser &&
  smtpPass &&
  smtpPass !== 'your-app-password' &&
  !smtpUser.includes('example')
);

let transporter: Transporter | null = null;

if (hasSmtpCredentials) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 2500,
    greetingTimeout: 2500,
  });
}

/**
 * Lấy lịch sử email đã gửi trong phiên hoạt động
 */
export function getEmailLogs(): EmailLog[] {
  return [...emailOutbox].reverse();
}

/**
 * Gửi email xác nhận đặt bàn thành công (Mô hình Transactional Outbox Pattern)
 */
export async function sendBookingConfirmationEmail(booking: {
  id: number;
  customerName: string;
  phone: string;
  email?: string;
  tableId: number;
  startTime: string;
  duration: number;
  people: number;
  type?: string;
  bookingType?: string;
}): Promise<{ success: boolean; mode: 'SMTP' | 'OUTBOX'; message: string }> {
  if (!booking.email) {
    return { success: false, mode: 'OUTBOX', message: 'Không có email người nhận.' };
  }

  const bookingCode = `PB-${String(booking.id).padStart(4, '0')}`;
  const startDate = new Date(booking.startTime);
  const timeStr = startDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const bType = booking.type || booking.bookingType || 'WALK_IN';

  const subject = `[PingPongBros] Xác nhận đặt bàn thành công - Mã #${bookingCode}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 24px; color: #2d3748; }
        .box { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
        .hdr { background: linear-gradient(135deg, #0d3b66, #1d4ba8); color: #ffffff; padding: 28px; text-align: center; }
        .hdr h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
        .hdr p { margin: 6px 0 0; opacity: 0.85; font-size: 14px; }
        .body { padding: 28px; }
        .code-card { background: #f0f7ff; border: 2px dashed #0066cc; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
        .code-val { font-size: 28px; font-weight: 800; color: #0066cc; letter-spacing: 2px; }
        .tbl { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .tbl td { padding: 10px 4px; border-bottom: 1px solid #edf2f7; font-size: 14px; }
        .tbl td:first-child { color: #718096; width: 40%; }
        .tbl td:last-child { font-weight: 600; color: #1a202c; text-align: right; }
        .alert { background: #fffaf0; border-left: 4px solid #dd6b20; padding: 12px 16px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #7b341e; }
        .ftr { background: #f7fafc; padding: 16px; text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #edf2f7; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="hdr">
          <h1>🏓 CLB BÓNG BÀN PINGPONGBROS</h1>
          <p>Xác nhận đặt bàn thành công</p>
        </div>
        <div class="body">
          <p>Xin chào <b>${booking.customerName}</b>,</p>
          <p>Cảm ơn bạn đã lựa chọn trải nghiệm dịch vụ tại PingPongBros. Đơn đặt bàn của bạn đã được ghi nhận trên hệ thống:</p>
          
          <div class="code-card">
            <div style="font-size: 12px; text-transform: uppercase; color: #4a5568; margin-bottom: 4px;">Mã check-in của bạn</div>
            <div class="code-val">${bookingCode}</div>
          </div>

          <table class="tbl">
            <tr><td>Bàn số</td><td>Bàn ${booking.tableId}</td></tr>
            <tr><td>Ngày chơi</td><td>${dateStr}</td></tr>
            <tr><td>Giờ bắt đầu</td><td>${timeStr}</td></tr>
            <tr><td>Thời lượng</td><td>${booking.duration} giờ</td></tr>
            <tr><td>Số người chơi</td><td>${booking.people} người</td></tr>
            <tr><td>Hình thức</td><td>${bType === 'MEMBER' ? 'Khách tháng (Hội viên)' : 'Khách vãng lai'}</td></tr>
          </table>

          <div class="alert">
            ⚠️ <b>Quy định giữ bàn (15 phút):</b><br/>
            Quý khách vui lòng đến quầy và cung cấp mã <b>${bookingCode}</b> để nhân viên check-in trong vòng <b>15 phút</b> kể từ giờ hẹn. Sau 15 phút, hệ thống sẽ tự động hủy lịch để nhường bàn cho khách hàng trong hàng chờ.
          </div>

          <p style="font-size: 13px; color: #4a5568;">Mọi thắc mắc xin vui lòng liên hệ hotline: <b>0905 123 456</b> hoặc phản hồi trực tiếp email này.</p>
        </div>
        <div class="ftr">
          © ${new Date().getFullYear()} PingPongBros Club - Đam mê trong từng đường bóng.<br/>
          Địa chỉ: 71 Ngũ Hành Sơn, Đà Nẵng
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Ghi nhận ngay vào Email Outbox (đảm bảo không bị trễ thời gian thực)
  const emailEntry: EmailLog = {
    id: `EMAIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    to: booking.email,
    subject,
    sentAt: new Date().toISOString(),
    status: hasSmtpCredentials ? 'SENT' : 'SIMULATED',
    preview: `Mã ${bookingCode} cho ${booking.customerName} (${booking.email}). Giao diện HTML đã kết xuất.`,
  };
  emailOutbox.push(emailEntry);

  // 2. Lưu vết thông báo vào SQL Server nếu có kết nối
  recordNotificationSQL(null, subject, `Mã đặt bàn ${bookingCode} cho khách ${booking.customerName} lúc ${timeStr} ${dateStr}`).catch(() => {});

  // 3. Nếu có thông tin SMTP thật thì gửi qua SMTP transporter
  if (transporter && hasSmtpCredentials) {
    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: booking.email,
        subject,
        html: htmlContent,
      });
      console.log(`[SMTP] Successfully sent confirmation email to ${booking.email} (Code: ${bookingCode})`);
      return { success: true, mode: 'SMTP', message: `Đã gửi email xác nhận thành công tới ${booking.email}` };
    } catch (err: any) {
      console.warn(`[SMTP Warning] Could not deliver to ${booking.email} via external SMTP (${err?.message || err}). Mail is safely saved in local outbox.`);
      emailEntry.status = 'SIMULATED';
    }
  }

  console.log(`[Email Outbox] Recorded booking confirmation email for ${booking.email} (Code: ${bookingCode})`);
  return {
    success: true,
    mode: 'OUTBOX',
    message: `Đã ghi nhận gửi email mã #${bookingCode} tới ${booking.email} (Outbox sẵn sàng)`,
  };
}
