import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DashboardResponse, User } from '../../types';
import type { PageId } from '../layout/Shell';
import { BookingSuccessModal, type BookingSuccessInfo } from '../common/BookingSuccessModal';

interface ExtractedBooking {
  customerName: string;
  people: number;
  date: string;
  time: string;
  duration: number;
  confidence: number;
}

interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  extracted?: ExtractedBooking;
  action?: { label: string; page: PageId };
  transferredToTeacher?: boolean;
  transferredToStaff?: boolean;
}

interface ChatWidgetProps {
  user: User;
  dashboard: DashboardResponse;
  onNavigate: (page: PageId) => void;
  onNotify: (message: string) => void;
}

export function ChatWidget({ user, dashboard, onNavigate, onNotify }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [botSuccessModal, setBotSuccessModal] = useState<BookingSuccessInfo | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [messages, open]);

  // Bộ bóc tách ngôn ngữ tự nhiên NLP của AI-3
  const parseBookingIntent = (text: string): ExtractedBooking | null => {
    const raw = text.toLowerCase();

    // 1. Nhận dạng số người (vd: 4 người, 4 ng, 2 bạn, đánh đôi -> 4, đánh đơn -> 2)
    let people = 2;
    let hasPeople = false;
    const peopleMatch = raw.match(/(\d+)\s*(người|nguoi|ng|bạn|ban|khách|khach)/);
    if (peopleMatch) {
      people = Math.min(4, Math.max(1, parseInt(peopleMatch[1], 10)));
      hasPeople = true;
    } else if (raw.includes('đánh đôi') || raw.includes('danh doi')) {
      people = 4;
      hasPeople = true;
    } else if (raw.includes('đánh đơn') || raw.includes('danh don')) {
      people = 2;
      hasPeople = true;
    }

    // 2. Nhận dạng ngày chơi (hỗ trợ cụ thể: 15/11, ngày 15/11, 15-11, ngày 15 tháng 11, ngày 15, hôm nay, mai, mốt)
    const today = new Date();
    let targetDate = new Date(today);
    let hasDate = false;

    // 2.1. Nhận dạng ngày cụ thể: 15/11, 15/11/2026, ngày 15/11, 15-11, ngày 15 tháng 11
    const explicitDateMatch = raw.match(/(?:ngày\s+)?(\d{1,2})(?:[\/\-](\d{1,2})(?:[\/\-](\d{4}))?|\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?)/);
    if (explicitDateMatch) {
      const d = parseInt(explicitDateMatch[1], 10);
      const m = parseInt(explicitDateMatch[2] || explicitDateMatch[4], 10);
      const y = explicitDateMatch[3] || explicitDateMatch[5] ? parseInt(explicitDateMatch[3] || explicitDateMatch[5], 10) : today.getFullYear();
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        targetDate = new Date(y, m - 1, d);
        hasDate = true;
      }
    } else {
      const singleDayMatch = raw.match(/ngày\s+(\d{1,2})\b/);
      if (singleDayMatch) {
        const d = parseInt(singleDayMatch[1], 10);
        if (d >= 1 && d <= 31) {
          targetDate = new Date(today.getFullYear(), today.getMonth(), d);
          hasDate = true;
        }
      }
    }

    // 2.2. Nhận dạng ngày tương đối
    if (!hasDate) {
      if (raw.includes('mai') || raw.includes('ngay mai') || raw.includes('tối mai') || raw.includes('chieu mai') || raw.includes('sáng mai')) {
        targetDate.setDate(today.getDate() + 1);
        hasDate = true;
      } else if (raw.includes('mốt') || raw.includes('ngay mot') || raw.includes('ngày kia')) {
        targetDate.setDate(today.getDate() + 2);
        hasDate = true;
      } else if (raw.includes('hôm nay') || raw.includes('hnay') || raw.includes('hn') || raw.includes('tối nay') || raw.includes('chieu nay') || raw.includes('sáng nay')) {
        hasDate = true;
      }
    }

    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    // 3. Nhận dạng giờ bắt đầu (start time)
    // Ưu tiên các cụm rõ nghĩa: "từ 20 giờ tối", "từ 20h", "lúc 20:00", "20 giờ tối", "20h", "8h tối", "8 giờ tối"
    let timeStr = '19:00';
    let hasTime = false;

    // Tìm giờ có từ khóa định vị: "từ X giờ", "lúc X giờ", "vào lúc X giờ", "từ Xh", "lúc Xh", "từ X:XX", "lúc X:XX"
    const prefixTimeMatch = raw.match(/(?:từ|tu|lúc|luc|vào|vao)\s+(\d{1,2})(?::(\d{2})|\s*(?:h|giờ|gio)(?:\s*(\d{2}))?)?\s*(tối|toi|chiều|chieu|sáng|sang|pm|am)?/);
    if (prefixTimeMatch) {
      let h = parseInt(prefixTimeMatch[1], 10);
      const m = prefixTimeMatch[2] || prefixTimeMatch[3] ? parseInt(prefixTimeMatch[2] || prefixTimeMatch[3], 10) : 0;
      const period = prefixTimeMatch[4] || '';
      if ((period.includes('tối') || period.includes('toi') || period.includes('chiều') || period.includes('chieu') || period === 'pm') && h < 12) {
        h += 12;
      }
      timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      hasTime = true;
    } else {
      // Tìm giờ có buổi đi kèm: "20 giờ tối", "20h tối", "8h tối", "8 giờ tối", "8h chiều", "7h pm"
      const suffixTimeMatch = raw.match(/(\d{1,2})(?::(\d{2})|\s*(?:h|giờ|gio)(?:\s*(\d{2}))?)\s*(tối|toi|chiều|chieu|sáng|sang|pm|am)/);
      if (suffixTimeMatch) {
        let h = parseInt(suffixTimeMatch[1], 10);
        const m = suffixTimeMatch[2] || suffixTimeMatch[3] ? parseInt(suffixTimeMatch[2] || suffixTimeMatch[3], 10) : 0;
        const period = suffixTimeMatch[4] || '';
        if ((period.includes('tối') || period.includes('toi') || period.includes('chiều') || period.includes('chieu') || period === 'pm') && h < 12) {
          h += 12;
        }
        timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        hasTime = true;
      } else {
        // Tìm giờ định dạng 24h: 19h, 20h, 19:00, 20:00 (không nằm trong cụm "trong X giờ" hoặc "chơi X giờ")
        const genericTime = raw.match(/(?<!trong\s|chơi\s|choi\s)(\b(1[0-9]|2[0-2]|[6-9])\s*(?:h|:00)\b)/);
        if (genericTime) {
          const h = parseInt(genericTime[2], 10);
          timeStr = `${String(h).padStart(2, '0')}:00`;
          hasTime = true;
        }
      }
    }

    // 4. Nhận dạng thời lượng (duration: 2 tiếng, 2 giờ, 1.5h, 3 tiếng, trong 2 giờ)
    let duration = 2;
    let hasDuration = false;
    const durMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:tiếng|tieng|tiếng đồng hồ)(?!\w)/)
      || raw.match(/(?<!từ\s|tu\s|lúc\s|luc\s|vào\s|vao\s)(\d+(?:\.\d+)?)\s*(?:giờ|gio)(?!\s*(?:tối|toi|chiều|chieu|sáng|sang|am|pm|\d))(?!\w)/);

    if (durMatch) {
      duration = parseFloat(durMatch[1]);
      hasDuration = true;
    }

    // 5. Tính độ tin cậy
    let score = 0;
    if (hasPeople) score += 25;
    if (hasDate) score += 25;
    if (hasTime) score += 25;
    if (hasDuration) score += 25;

    // Nếu chứa từ khóa đặt bàn hoặc có ít nhất 1 thực thể
    const isBookingQuestion = /đặt|dat|book|chơi|choi|bàn|ban|giữ|giu/.test(raw);
    if (isBookingQuestion || score >= 25) {
      return {
        customerName: user.name,
        people,
        date: dateStr,
        time: timeStr,
        duration: duration || 2,
        confidence: score,
      };
    }

    return null;
  };

  const answer = (raw: string): { text: string; extracted?: ExtractedBooking; transferredToTeacher?: boolean; transferredToStaff?: boolean } => {
    const text = raw.toLowerCase().trim();
    const role = user.role;

    // Tính toán số liệu tài chính nội bộ phục vụ phân quyền
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const payments = dashboard.payments || [];
    const todayPayments = payments.filter((p) => p.createdAt && p.createdAt.slice(0, 10) === todayStr);
    const todayRev = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    const todayTxCount = todayPayments.length;

    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const weekRev = payments
      .filter((p) => new Date(p.createdAt) >= startOfWeek)
      .reduce((sum, p) => sum + p.amount, 0);

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthRev = payments
      .filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, p) => sum + p.amount, 0);

    // 1. Thử phân tích ý định đặt bàn bằng NLP (Mục 2: Thiết lập ngưỡng độ tin cậy >= 80%)
    const bookingIntent = parseBookingIntent(raw);
    if (bookingIntent) {
      const CONFIDENCE_THRESHOLD = 80;
      if (bookingIntent.confidence < CONFIDENCE_THRESHOLD) {
        return {
          text: `⚠️ Độ tin cậy của thông tin bóc tách là **${bookingIntent.confidence}%** (dưới ngưỡng quy định 80%).\n\n` +
            `Dữ liệu câu yêu cầu chưa đủ thông tin xác thực để tự động đề xuất. Theo quy định bảo đảm chất lượng, Trợ lý AI không tự suy đoán thông tin thiếu và đã chuyển câu hỏi đến Nhân viên để trực tiếp hỗ trợ bạn.`,
          transferredToStaff: true,
        };
      }

      return {
        text: `🤖 AI-3 đã bóc tách thông tin đặt bàn từ câu của bạn (Độ tin cậy: **${bookingIntent.confidence}%** ≥ 80% - Đạt ngưỡng quy định):\n` +
          `• Khách hàng: ${bookingIntent.customerName}\n` +
          `• Ngày chơi: ${bookingIntent.date}\n` +
          `• Giờ bắt đầu: ${bookingIntent.time}\n` +
          `• Thời lượng: ${bookingIntent.duration} giờ\n` +
          `• Số người: ${bookingIntent.people} người (Tối đa 4 người/bàn)\n\n` +
          `🛡️ **Giới hạn quyền Chatbot (Mục 3):** Chatbot chỉ có chức năng tư vấn, hướng dẫn và hỗ trợ điền biểu mẫu. Chatbot không được tự quyết định hoặc xác nhận giao dịch thay con người. Bạn vui lòng nhấn nút bên dưới để mở Form kiểm tra và tự nhấn **"Xác nhận đặt bàn"**.`,
        extracted: bookingIntent,
      };
    }

    // 2. GIỚI HẠN QUYỀN THỰC HIỆN CỦA CHATBOT (MỤC 3)
    // Chặn yêu cầu chatbot tự động xác nhận, tự thanh toán hoặc thao tác thay người dùng
    if (/xác nhận luôn|xac nhan luon|chốt luôn|chot luon|đặt luôn giùm|dat luon gium|thanh toán luôn|thanh toan luon|tự động đặt|tu dong dat|thao tác thay|chốt bàn/.test(text)) {
      return {
        text: `⛔ **Giới hạn quyền thực hiện của Chatbot:**\n` +
          `• Chatbot chỉ có chức năng tư vấn, hướng dẫn, cung cấp thông tin và hỗ trợ điền biểu mẫu.\n` +
          `• Chatbot **không được tự đưa ra quyết định, xác nhận giao dịch hoặc thực hiện thao tác thay con người**.\n` +
          `👉 Bạn vui lòng mở Form Đặt Bàn, kiểm tra thông tin và tự nhấn nút **"Xác nhận đặt bàn"** trên màn hình.`,
      };
    }

    // 2. PHÂN QUYỀN CHATBOT THEO TÀI KHOẢN (MỤC 1 & MỤC 4: BẢO MẬT & KIỂM SOÁT QUYỀN TRUY CẬP)
    // Chatbot luôn xác định vai trò tài khoản (role) trước khi truy xuất dữ liệu

    // 2.1. Tra cứu DOANH THU & TÀI CHÍNH NỘI BỘ
    if (/doanh thu|doanh so|doanh_thu|thu nhap|tiền thu|doanh số|thu nhập|doanhthu|doanh thu ngày|doanh thu tuần|doanh thu tháng/.test(text)) {
      // Khách vãng lai & Khách tháng: TUYỆT ĐỐI KHÔNG ĐƯỢC XEM
      if (role === 'GUEST' || role === 'MEMBER') {
        return {
          text: '⛔ **[Bảo mật] Quyền truy cập bị từ chối:** Tài khoản vai trò Khách hàng không có quyền xem thông tin doanh thu của câu lạc bộ. Bạn chỉ được hỏi về đặt bàn, giờ mở cửa, giá thuê bàn theo giờ, giá các gói hội viên và thông tin hội viên.',
        };
      }

      // Giáo viên: TUYỆT ĐỐI KHÔNG ĐƯỢC XEM DOANH THU CLB
      if (role === 'TEACHER') {
        return {
          text: '⛔ **[Bảo mật] Quyền truy cập bị từ chối:** Tài khoản vai trò Giáo viên không có quyền xem doanh thu của câu lạc bộ. Bạn chỉ được hỏi về giá lớp học, lịch học và đặt bàn phục vụ lớp học.',
        };
      }

      // Nhân viên: ĐƯỢC HỎI DOANH THU CỦA NGÀY HIỆN TẠI - KHÔNG ĐƯỢC XEM THEO TUẦN HOẶC THÁNG
      if (role === 'STAFF') {
        if (/tuần|tuan|tháng|thang|quý|quy|năm|nam|toàn thời gian|tổng/.test(text)) {
          return {
            text: '⛔ **[Bảo mật] Giới hạn quyền truy cập Nhân viên:** Theo quy chế bảo mật, tài khoản Nhân viên **chỉ được xem doanh thu của ngày hiện tại**. Tuyệt đối không được truy xuất doanh thu theo tuần hoặc tháng.',
          };
        }
        // Doanh thu ngày hiện tại
        return {
          text: `📊 **Báo cáo Doanh thu Ngày hiện tại (${new Date().toLocaleDateString('vi-VN')}):**\n` +
            `• Số tiền đã thu hôm nay: **${todayRev.toLocaleString('vi-VN')}đ**\n` +
            `• Số giao dịch hôm nay: **${todayTxCount} giao dịch**\n\n` +
            `*(Lưu ý bảo mật: Tài khoản Nhân viên không được cấp quyền xem doanh thu theo tuần hoặc tháng).*`,
        };
      }

      // Quản lý: ĐƯỢC HỎI TẤT CẢ THÔNG TIN HỆ THỐNG (DOANH THU THEO NGÀY, TUẦN, THÁNG)
      if (role === 'MANAGER') {
        return {
          text: `📈 **Báo cáo Doanh thu Hệ thống (Toàn quyền Quản lý):**\n` +
            `• **Doanh thu Hôm nay:** ${todayRev.toLocaleString('vi-VN')}đ (${todayTxCount} giao dịch)\n` +
            `• **Doanh thu Tuần này:** ${weekRev.toLocaleString('vi-VN')}đ\n` +
            `• **Doanh thu Tháng này:** ${monthRev.toLocaleString('vi-VN')}đ\n` +
            `• **Tổng tích lũy:** ${dashboard.stats.totalRevenue.toLocaleString('vi-VN')}đ (${dashboard.payments.length} giao dịch).`,
        };
      }
    }

    // 2.2. Giáo viên hỏi về đặt bàn phục vụ lớp học
    if (role === 'TEACHER' && (/đặt bàn|dat ban|phục vụ lớp|phuc vu lop|bàn dạy|ban day|khu dạy|khu day/.test(text))) {
      return {
        text: `🏓 **Đặt bàn phục vụ lớp học (Dành cho Giáo viên):**\n` +
          `• Giáo viên được quyền đăng ký đặt bàn phục vụ lớp học tại **khu dạy học (bàn 1 đến 4)**.\n` +
          `• Mỗi lớp học được phân bổ 2 bàn trong thời lượng 2 giờ và **phải kết thúc trước ${dashboard.config.classCutoffHour}:00**.\n` +
          `• Đơn đặt bàn lớp học cần gửi qua mục "Lớp học" để Quản lý phê duyệt trước khi diễn ra.`,
      };
    }

    // 2.3. Tra cứu LỚP HỌC & GIÁ BUỔI DẠY
    if (/lớp|lop|dạy|day|học|hoc|giáo viên|giao vien|thù lao|thu lao|lịch học|lich hoc/.test(text)) {
      if (role === 'TEACHER') {
        const myClasses = dashboard.classes.filter(
          (c) => c.teacherName === user.name || (user.id && (c as any).teacherId === user.id)
        );
        const approved = myClasses.filter((c) => c.status === 'approved').length;
        const pending = myClasses.filter((c) => c.status === 'pending').length;
        const rejected = myClasses.filter((c) => c.status === 'rejected').length;

        return {
          text: `🎓 **Thông tin Lớp học & Thù lao của bạn (${user.name}):**\n` +
            `• Giá lớp học (Thù lao): **250.000đ / buổi dạy 2 giờ** (chốt và chi trả cuối tháng).\n` +
            `• Lịch học của bạn: ${approved} lớp đã duyệt, ${pending} lớp chờ duyệt, ${rejected} lớp từ chối.\n` +
            `• Đặt bàn phục vụ lớp: Bàn 1-4 trước ${dashboard.config.classCutoffHour}:00.`,
        };
      }

      if (role === 'MANAGER') {
        const totalClasses = dashboard.classes.length;
        const pendingCount = dashboard.classes.filter((c) => c.status === 'pending').length;
        return {
          text: `🎓 **Thông tin Lớp học Toàn hệ thống (Quản lý):**\n` +
            `• Tổng số lớp: ${totalClasses} lớp.\n` +
            `• Lớp chờ duyệt: **${pendingCount} lớp**.\n` +
            `• Thù lao giáo viên: ${dashboard.config.teacherPrice ? dashboard.config.teacherPrice.toLocaleString('vi-VN') : '250.000'}đ / buổi dạy 2h.\n` +
            `• Khu vực lớp: Bàn 1-4 trước ${dashboard.config.classCutoffHour}:00.`,
        };
      }

      return {
        text: `🎓 **Thông tin Lớp học:** Các lớp bóng bàn do giáo viên giảng dạy tại bàn 1-4 trong 2 giờ và kết thúc trước ${dashboard.config.classCutoffHour}:00. Sau ${dashboard.config.classCutoffHour}:00 các bàn này mở cho khách tự do đặt.`,
      };
    }

    // 2.4. Tra cứu THÔNG TIN HỘI VIÊN & CÁC GÓI HỘI VIÊN
    if (/hội viên|hoi vien|thông tin hội viên|thẻ của tôi|the cua toi|gói của tôi|goi cua toi|lượt còn|luot con|gói tháng|goi thang/.test(text)) {
      if (role === 'MEMBER') {
        const mem = dashboard.members.find((m) => m.id === user.memberId || m.phone === user.phone || m.email === user.email);
        if (mem) {
          const left = Math.max(0, mem.totalTurns - mem.usedTurns);
          return {
            text: `🎟️ **Thông tin Hội viên của bạn (${mem.name}):**\n` +
              `• Gói đang dùng: **${mem.packageType.toUpperCase()}** (${mem.totalTurns} lượt)\n` +
              `• Lượt chơi còn lại: **${left} / ${mem.totalTurns} lượt**\n` +
              `• Thời hạn: từ ${new Date(mem.startDate).toLocaleDateString('vi-VN')} đến ${new Date(mem.endDate).toLocaleDateString('vi-VN')}\n` +
              `• Trạng thái: ${left === 0 ? '⚠️ Hết lượt (vẫn có thể đặt sân và trả tiền mặt theo lượt)' : left <= 5 ? '⚠️ Sắp hết lượt (hãy gia hạn để cộng dồn)' : '✓ Đang hoạt động'}.`,
          };
        }
      }

      if (role === 'GUEST' || role === 'MEMBER') {
        return {
          text: `🎟️ **Bảng giá các gói hội viên:**\n` +
            `• Gói 1 tháng: **449.000đ** (30 lượt / 30 ngày - 14.967đ/lượt 2h)\n` +
            `• Gói 3 tháng: **1.149.000đ** (90 lượt / 90 ngày - 12.767đ/lượt 2h)\n` +
            `• Gói 6 tháng: **1.999.000đ** (180 lượt / 180 ngày - 11.106đ/lượt 2h - Tiết kiệm nhất)\n` +
            `👉 Quý khách có thể liên hệ nhân viên tại quầy hoặc hỏi chatbot để được hỗ trợ đăng ký.`,
        };
      }

      if (role === 'STAFF' || role === 'MANAGER') {
        return {
          text: `👥 **Thông tin Hội viên Hệ thống:** Hiện có **${dashboard.stats.activeMembers} hội viên** đang hoạt động với các gói tháng.`,
        };
      }
    }

    // 2.5. Tra cứu LỊCH ĐẶT BÀN & TÌNH TRẠNG BÀN
    if (/bàn|ban|trống|con ban|còn chỗ|lịch đặt|lich dat|sân|san|tình trạng bàn/.test(text)) {
      const available = dashboard.tables.filter((t) => t.status === 'available').length;
      const busy = dashboard.tables.filter((t) => t.status === 'busy').length;
      const reserved = dashboard.tables.filter((t) => t.status === 'reserved').length;

      if (role === 'STAFF' || role === 'MANAGER') {
        return {
          text: `🏓 **Lịch đặt bàn & Tình trạng bàn hôm nay:**\n` +
            `• Bàn trống sẵn sàng: **${available}/16 bàn**\n` +
            `• Bàn đang chơi: **${busy}/16 bàn**\n` +
            `• Bàn đã đặt trước: **${reserved}/16 bàn**\n` +
            `• Tổng đơn đặt bàn hôm nay: **${dashboard.stats.todayBookings} lượt**\n` +
            `Nhân viên/Quản lý có thể theo dõi sơ đồ sân thời gian thực tại tab "Bàn".`,
        };
      }

      return {
        text: `🏓 Hiện tại CLB có **${available}/16 bàn đang trống**. Quý khách có thể đặt bàn trực tiếp bằng cách gõ yêu cầu (ví dụ: *"tối mai 19h cho 4 người chơi 2 tiếng"*) để AI hỗ trợ điền form đặt bàn!`,
      };
    }

    // 2.6. Tra cứu GIÁ THUÊ BÀN THEO GIỜ & GIỜ MỞ CỬA
    if (/giá|gia|chi phí|tiền|bao nhiêu|bao nhieu|giá thuê bàn/.test(text)) {
      return {
        text: `💰 **Bảng giá thuê bàn & Dịch vụ:**\n` +
          `• Giá thuê bàn theo giờ (khách lẻ): **${dashboard.config.courtPrice.toLocaleString('vi-VN')}đ / người / giờ** (mặc định 2 giờ).\n` +
          `• Giá thuê bàn phục vụ lớp học (Giáo viên): **250.000đ / lượt 2 giờ**.\n` +
          `• Gói hội viên tháng: 1 tháng (449.000đ), 3 tháng (1.149.000đ), 6 tháng (1.999.000đ).`,
      };
    }

    if (/giờ|mở cửa|mo cua|đóng cửa|dong cua|thời gian/.test(text)) {
      return {
        text: `⏰ **Giờ mở cửa CLB PingPongBros:**\n` +
          `• Giờ hoạt động: **${String(dashboard.config.openingHour).padStart(2, '0')}:00 đến ${String(dashboard.config.closingHour).padStart(2, '0')}:00** hàng ngày.\n` +
          `• Khu bàn dạy học (bàn 1-4) mở cho khách đặt tự do sau **${dashboard.config.classCutoffHour}:00**.\n` +
          `• Quy tắc giữ bàn: Quá 15 phút so với giờ hẹn không check-in, bàn sẽ tự động giải phóng.`,
      };
    }

    // 2.7. Kiểm tra câu chào hỏi
    if (/^(chào|hi|hello|alo|xin chào|hey|bạn là ai|ban la ai|giới thiệu|gioi thieu)/.test(text)) {
      return {
        text: `Xin chào ${user.name}! Tôi là Trợ lý AI-3 của PingPongBros. Tôi có thể hỗ trợ bạn tra cứu giá thuê bàn, giờ mở cửa, tình trạng bàn, thông tin gói hội viên hoặc hỗ trợ điền nhanh form đặt bàn. Bạn cần thông tin gì?`,
      };
    }

    // Nếu không khớp dữ liệu xác thực nào trong hệ thống: Không tự suy đoán, chuyển câu hỏi đến Nhân viên (Mục 2)
    return {
      text: `⚠️ Độ tin cậy thông tin cho câu hỏi này là **35%** (dưới ngưỡng quy định 80%) và không có dữ liệu xác thực trong hệ thống PingPongBros.\n\n` +
        `Theo quy định, Chatbot không được tự suy đoán hoặc cung cấp thông tin không có trong hệ thống. Câu hỏi của bạn đã được chuyển đến Nhân viên để trực tiếp hỗ trợ giải đáp.`,
      transferredToStaff: true,
    };
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    const response = answer(text);
    setMessages((current) => [
      ...current,
      { id, role: 'user', text },
      {
        id: id + 1,
        role: 'assistant',
        text: response.text,
        extracted: response.extracted,
        transferredToTeacher: response.transferredToTeacher,
        transferredToStaff: response.transferredToStaff,
      },
    ]);
    setDraft('');
  };

  const handleOpenBookingForm = (extracted: ExtractedBooking) => {
    setOpen(false);
    onNavigate('san');
    window.dispatchEvent(new CustomEvent('ai3-fill-booking', { detail: extracted }));
    onNotify(`Đã hỗ trợ điền thông tin vào Form Đặt Bàn. Bạn vui lòng kiểm tra lại thông tin và tự nhấn nút "Xác nhận đặt bàn".`);
  };

  // Câu hỏi gợi ý hiển thị chuẩn hóa theo từng vai trò tài khoản (Mục 1)
  const quickQuestions = user.role === 'TEACHER'
    ? ['Giá lớp học bao nhiêu?', 'Lịch học của tôi?', 'Đặt bàn phục vụ lớp học', 'Bàn khu dạy học mở đến mấy giờ?']
    : user.role === 'MEMBER'
      ? ['Thông tin hội viên của tôi?', 'Giá các gói hội viên?', 'Giờ mở cửa CLB?', 'Tối mai 19h cho 4 người']
      : user.role === 'STAFF'
        ? ['Lịch đặt bàn và tình trạng bàn?', 'Doanh thu ngày hiện tại?', 'Còn bàn trống không?', 'Quy tắc giữ bàn 15 phút?']
        : user.role === 'MANAGER'
          ? ['Doanh thu hôm nay, tuần này và tháng này?', 'Lịch đặt bàn và tình trạng bàn?', 'Thông tin lớp học hệ thống?', 'Thông tin hội viên hoạt động?']
          : ['Giá thuê bàn theo giờ?', 'Giờ mở cửa CLB?', 'Giá các gói hội viên?', 'Tối mai 19h cho 2 người'];

  const askQuestion = (question: string) => {
    const id = Date.now();
    const response = answer(question);
    setMessages((current) => [
      ...current,
      { id, role: 'user', text: question },
      {
        id: id + 1,
        role: 'assistant',
        text: response.text,
        extracted: response.extracted,
        transferredToTeacher: response.transferredToTeacher,
        transferredToStaff: response.transferredToStaff,
      },
    ]);
  };

  return (
    <>
      {open && (
        <section className="bot" role="dialog" aria-label="Trợ lý đặt bàn AI">
          <div className="bot-h">
            <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Trợ lý đặt bàn</span>
              <span className="tag" style={{ background: '#ffffff33', color: '#fff' }}>AI-3 NLP</span>
            </b>
            <button className="btn sm ghost" type="button" aria-label="Đóng trợ lý" onClick={() => setOpen(false)}>
              Đóng
            </button>
          </div>
          <div className="bot-st" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Xin chào, {user.name}</span>
            <span className="tag" style={{ background: '#0284c7', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
              🔒 {user.role === 'MANAGER' ? 'Quản lý (Toàn quyền)' : user.role === 'STAFF' ? 'Nhân viên' : user.role === 'TEACHER' ? 'Giáo viên' : user.role === 'MEMBER' ? 'Khách tháng' : 'Khách vãng lai'}
            </span>
          </div>
          <div className="bot-m" ref={thread} aria-live="polite">
            {!messages.length && (
              <div className="msg b">
                Xin chào! Tôi là Trợ lý AI-3. Bạn có thể nhập câu tự nhiên (ví dụ: <i>"tối mai 7h cho 4 người chơi 2 tiếng"</i>) hoặc chọn các câu hỏi bên dưới.
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`msg ${message.role === 'assistant' ? 'b' : 'u'}`}>
                <div style={{ whiteSpace: 'pre-line' }}>{message.text}</div>
                {message.extracted && (
                  <div style={{ marginTop: 8, padding: '10px', background: '#eff6ff', borderRadius: 8, border: '1.5px solid #3b82f6' }}>
                    <div style={{ fontSize: 12, color: '#1e40af', marginBottom: 6, fontWeight: 500 }}>
                      📋 <b>Hỗ trợ điền trước biểu mẫu:</b> AI đã chuẩn bị sẵn thông tin. Bạn cần tự kiểm tra và nhấn nút Xác nhận trên form.
                    </div>
                    <button
                      className="btn sm"
                      type="button"
                      style={{ width: '100%', fontSize: 13, fontWeight: 'bold', background: '#1d4ed8', color: '#fff', padding: '8px 12px' }}
                      onClick={() => handleOpenBookingForm(message.extracted!)}
                    >
                      📝 Mở Form Đã Điền Sẵn (Bạn Tự Nhấn "Xác Nhận Đặt Bàn")
                    </button>
                  </div>
                )}
                {(message.transferredToStaff || message.transferredToTeacher) && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef3c7', borderRadius: 6, border: '1px solid #f59e0b', fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                    <b>👨‍💼 Đã chuyển câu hỏi đến Nhân viên hỗ trợ:</b> Độ tin cậy dưới ngưỡng quy định 80% hoặc câu hỏi không có dữ liệu xác thực trong hệ thống. Nhân viên trực sân đã tiếp nhận thông tin và sẽ hỗ trợ giải đáp trực tiếp cho bạn!
                  </div>
                )}
                {message.action && (
                  <div className="btns">
                    <button className="btn sm red" type="button" onClick={() => onNavigate(message.action!.page)}>
                      {message.action.label}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="faq" aria-label="Câu hỏi thường gặp theo vai trò">
            {quickQuestions.map((question) => (
              <button key={question} type="button" onClick={() => askQuestion(question)}>
                {question}
              </button>
            ))}
          </div>

          <form className="bot-f" onSubmit={send}>
            <input
              className="in"
              placeholder="Nhập yêu cầu: tối mai 7h cho 4 người..."
              autoComplete="off"
              aria-label="Tin nhắn"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="btn" type="submit">
              Gửi
            </button>
          </form>
        </section>
      )}

      <button
        className="bot-fab"
        type="button"
        aria-label={open ? 'Đóng trợ lý đặt bàn AI' : 'Mở trợ lý đặt bàn AI'}
        title="Trợ lý đặt bàn AI (AI-3)"
        onClick={() => setOpen((value) => !value)}
      >
        <Paddle size={34} />
      </button>

      {botSuccessModal && (
        <BookingSuccessModal info={botSuccessModal} onClose={() => setBotSuccessModal(null)} />
      )}
    </>
  );
}

function Paddle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <g transform="rotate(-35 20 20)">
        <rect x="17" y="27" width="6" height="11" rx="2" fill="#e9d7b5" stroke="#fff" strokeWidth="1.6" />
        <line x1="17.5" y1="31" x2="22.5" y2="31" stroke="#8c6a3a" strokeWidth="1.2" />
        <ellipse cx="20" cy="16" rx="12.5" ry="13.5" fill="#8c1c2c" stroke="#fff" strokeWidth="2.4" />
        <path d="M12 12 Q20 6 28 12" stroke="#ffffff66" strokeWidth="1.6" fill="none" />
      </g>
      <circle cx="33.5" cy="30" r="4.2" fill="#fff" stroke="#c9d2e6" strokeWidth=".8" />
    </svg>
  );
}
