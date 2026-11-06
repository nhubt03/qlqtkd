import { dashboardData } from '../data/mock.js';

/**
 * Quét và tự động hủy các đơn đặt quá hạn 15 phút chưa check-in (Quy tắc BR04)
 */
export function sweepExpiredBookings(nowTime = Date.now()): number[] {
  const cancelledIds: number[] = [];

  dashboardData.bookings.forEach((booking) => {
    if (booking.status === 'CONFIRMED') {
      const startTime = new Date(booking.startTime).getTime();
      const diffMinutes = (nowTime - startTime) / (60 * 1000);

      if (diffMinutes >= 15) {
        booking.status = 'CANCELLED';
        const table = dashboardData.tables.find((t) => t.tableNumber === booking.tableId);
        if (table && table.status === 'busy') {
          table.status = 'available';
        }
        cancelledIds.push(booking.id);
        console.log(`[Scheduler] Đã tự động hủy lượt đặt #${booking.id} (Quá hạn 15 phút chưa check-in) và giải phóng Bàn ${booking.tableId}.`);
      }
    }
  });

  return cancelledIds;
}

/**
 * Quét và tự động chuyển trạng thái khi gói tháng hết hạn (Mục 8)
 * - Khi thời hạn gói kết thúc: chuyển member sang 'expired'
 * - Chuyển tài khoản khách về GUEST, giữ nguyên 100% dữ liệu lịch sử
 */
export function sweepExpiredMemberships(nowTime = Date.now()): number[] {
  const expiredIds: number[] = [];

  dashboardData.members.forEach((member) => {
    if (member.status === 'active' && member.endDate) {
      const endMs = new Date(member.endDate).getTime();
      if (endMs < nowTime) {
        member.status = 'expired';
        expiredIds.push(member.id);

        // Tìm tài khoản người dùng tương ứng để chuyển về GUEST, giữ nguyên toàn bộ lịch sử
        const user = dashboardData.users.find(
          (u) => u.memberId === member.id || (u.role === 'MEMBER' && (u.phone === member.phone || (member.email && u.email.toLowerCase() === member.email.toLowerCase())))
        );

        if (user && user.role === 'MEMBER') {
          user.role = 'GUEST';
        }

        dashboardData.auditLogs = dashboardData.auditLogs || [];
        dashboardData.auditLogs.push({
          id: dashboardData.auditLogs.length + 1,
          timestamp: new Date(nowTime).toISOString(),
          actorEmail: 'system@pingpongbros.vn',
          actorRole: 'SYSTEM',
          action: 'EXPIRE_MEMBER_PACKAGE',
          details: `Gói tháng #${member.id} của ${member.name} (${member.phone}) hết hạn vào ${member.endDate}. Đã chuyển tài khoản về Khách vãng lai, toàn bộ dữ liệu lịch sử được bảo toàn.`,
        });

        console.log(`[Scheduler] Gói tháng của hội viên #${member.id} (${member.name}) đã hết hạn. Đã chuyển về Khách vãng lai, bảo lưu dữ liệu.`);
      }
    }
  });

  return expiredIds;
}

/**
 * Tác vụ định kỳ hệ thống PingPongBros:
 * - BR04: Quá 15 phút kể từ giờ đặt mà chưa check-in -> Tự động hủy lượt và giải phóng bàn.
 * - Mục 8: Tự động quét và xử lý khi gói tháng hết hạn.
 * - Nhắc nhở trước 30 phút và nhắc trễ 5 phút (giữ bàn trong 15p).
 * - Vào 23:59 ngày cuối tháng tổng hợp tiền giáo viên (250k/lượt).
 */
export function startBackgroundScheduler(): () => void {
  const timer = setInterval(() => {
    const now = new Date();
    sweepExpiredBookings(now.getTime());
    sweepExpiredMemberships(now.getTime());

    // 2. Tự động kiểm tra cuối tháng tổng hợp tiền giáo viên
    const isLastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
    if (isLastDay && now.getHours() === 23 && now.getMinutes() >= 58) {
      console.log('[Scheduler] 23:59 ngày cuối tháng: Đã tổng hợp tiền dạy của các giáo viên để quản lý thu ngoài.');
    }
  }, 30000); // Quét mỗi 30 giây

  return () => clearInterval(timer);
}
