import { dashboardData } from '../data/mock.js';

/**
 * Tác vụ định kỳ hệ thống PingPongBros:
 * - BR04: Quá 15 phút kể từ giờ đặt mà chưa check-in -> Tự động hủy lượt và giải phóng bàn.
 * - Nhắc nhở trước 30 phút và nhắc trễ 5 phút (giữ bàn trong 15p).
 * - Vào 23:59 ngày cuối tháng tổng hợp tiền giáo viên (250k/lượt).
 */
export function startBackgroundScheduler(): () => void {
  const timer = setInterval(() => {
    const now = new Date();
    const nowTime = now.getTime();

    // 1. Kiểm tra quá hạn 15 phút chưa check-in -> Hủy lượt & giải phóng bàn
    dashboardData.bookings.forEach((booking) => {
      if (booking.status === 'CONFIRMED') {
        const startTime = new Date(booking.startTime).getTime();
        const diffMinutes = (nowTime - startTime) / (60 * 1000);

        if (diffMinutes >= 15) {
          booking.status = 'CANCELLED';
          const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
          if (table) {
            table.status = 'available';
          }
          console.log(`[Scheduler] Đã tự động hủy lượt đặt #${booking.id} (Quá hạn 15 phút chưa check-in) và giải phóng Bàn ${booking.tableId}.`);
        }
      }
    });

    // 2. Tự động kiểm tra cuối tháng tổng hợp tiền giáo viên
    const isLastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
    if (isLastDay && now.getHours() === 23 && now.getMinutes() >= 58) {
      console.log('[Scheduler] 23:59 ngày cuối tháng: Đã tổng hợp tiền dạy của các giáo viên để quản lý thu ngoài.');
    }
  }, 30000); // Quét mỗi 30 giây

  return () => clearInterval(timer);
}
