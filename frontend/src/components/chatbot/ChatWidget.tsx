import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DashboardResponse, TransferredConversation, User } from '../../types';
import type { PageId } from '../layout/Shell';
import { BookingSuccessModal, type BookingSuccessInfo } from '../common/BookingSuccessModal';
import { transferConversation, sendTransferredMessage } from '../../services/api';

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
  const [transferredConv, setTransferredConv] = useState<TransferredConversation | null>(null);
  const [isMuted, setIsMuted] = useState(false); // Khi true: Chatbot ngưng tham gia, chuyển sang người thật
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [messages, open]);

  // Polling cập nhật phản hồi từ Nhân viên / Quản lý khi cuộc hội thoại đã được chuyển tiếp (Mục 2)
  useEffect(() => {
    if (!transferredConv || !open) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/transferred?role=MANAGER`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.conversations)) {
          const updated = data.conversations.find((c: any) => c.id === transferredConv.id);
          if (updated && updated.messages.length > transferredConv.messages.length) {
            const newAgentMsgs = updated.messages.slice(transferredConv.messages.length);
            setTransferredConv(updated);
            newAgentMsgs.forEach((m: any) => {
              if (m.sender === 'agent' || m.sender === 'system') {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now() + Math.random(),
                    role: 'assistant',
                    text: `👨‍💼 [${m.senderName}]: ${m.text}`,
                  },
                ]);
              }
            });
          }
        }
      } catch {
        // bỏ qua lỗi polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [transferredConv, open]);

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
    // Nếu chứa yêu cầu điền form đặt bàn
    const isFillFormIntent = /hãy giúp tôi điền form|giúp tôi điền form|điền form đặt bàn/i.test(raw);
    if (isFillFormIntent) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      return {
        customerName: user.name,
        people: people || 2,
        date: hasDate ? dateStr : tomorrowStr,
        time: hasTime ? timeStr : '17:00',
        duration: duration || 2,
        confidence: 100,
      };
    }

    // 5. Tính độ tin cậy
    let score = 0;
    if (hasPeople) score += 25;
    if (hasDate) score += 25;
    if (hasTime) score += 25;
    if (hasDuration) score += 25;

    // Chỉ kích hoạt bóc tách đặt bàn khi có ý định rõ ràng (chứa từ khóa đặt bàn và có ít nhất 1 thông số cụ thể)
    const isExplicitBooking = /đặt bàn|dat ban|book bàn|book ban|đặt trước|dat truoc/i.test(raw);
    if ((isExplicitBooking && score >= 25) || score >= 50) {
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

    // 1. Phân tích ý định đặt bàn & hỗ trợ điền form (Mục tiêu: Đạt ngưỡng tin cậy >= 80%)
    const bookingIntent = parseBookingIntent(raw);
    if (bookingIntent) {
      const CONFIDENCE_THRESHOLD = 80;
      if (bookingIntent.confidence < CONFIDENCE_THRESHOLD) {
        return {
          text: `⚠️ Độ tin cậy của thông tin bóc tách là **${bookingIntent.confidence}%** (dưới ngưỡng quy định 80%).\n\n` +
            `Dữ liệu câu yêu cầu chưa đủ thông tin xác thực để tự động đề xuất. Theo quy chế bảo mật, Trợ lý AI không tự suy đoán thông tin thiếu và đã chuyển câu hỏi đến ${role === 'STAFF' ? 'Quản lý' : 'Nhân viên trực quầy'} để trực tiếp hỗ trợ bạn.`,
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
          `🛡️ **Giới hạn quyền Chatbot:** Chatbot chỉ có chức năng tư vấn, hướng dẫn và hỗ trợ điền biểu mẫu. Chatbot không được tự quyết định hoặc xác nhận giao dịch thay con người. Bạn vui lòng nhấn nút bên dưới để mở Form kiểm tra và tự nhấn **"Xác nhận đặt bàn"**.`,
        extracted: bookingIntent,
      };
    }

    // 2. GIỚI HẠN QUYỀN THỰC HIỆN CỦA CHATBOT: Không tự đưa ra quyết định / thanh toán thay con người
    if (/xác nhận luôn|xac nhan luon|chốt luôn|chot luon|đặt luôn giùm|dat luon gium|thanh toán luôn|thanh toan luon|tự động đặt|tu dong dat|thao tác thay|chốt bàn/i.test(text)) {
      return {
        text: `⛔ **Giới hạn quyền thực hiện của Chatbot:**\n` +
          `• Chatbot chỉ có chức năng tư vấn, hướng dẫn, cung cấp thông tin và hỗ trợ điền biểu mẫu.\n` +
          `• Chatbot **không được tự đưa ra quyết định, xác nhận giao dịch hoặc thực hiện thao tác thay con người**.\n` +
          `👉 Bạn vui lòng mở Form Đặt Bàn, kiểm tra thông tin và tự nhấn nút **"Xác nhận đặt bàn"** trên màn hình.`,
      };
    }

    // 3. PHÂN QUYỀN CHATBOT THEO TÀI KHOẢN THEO ĐÚNG YÊU CẦU ĐẶC TẢ

    // 3.1. [GIÁO VIÊN]: GIÁ CỦA MỘT BUỔI DẠY LÀ BAO NHIÊU
    if (/giá của một buổi dạy|gia cua mot buoi day|giá một buổi dạy|gia mot buoi day|thù lao một buổi dạy|thu lao mot buoi/i.test(text)) {
      if (role === 'TEACHER' || role === 'MANAGER') {
        const teacherPrice = dashboard.config.teacherPrice || 250000;
        return {
          text: `🎓 **Giá của một buổi dạy (Thù lao Giáo viên):**\n` +
            `• Thù lao định mức: **${teacherPrice.toLocaleString('vi-VN')}đ / buổi dạy 2 giờ**.\n` +
            `• Hệ thống tự động ghi nhận số lớp đã duyệt và giảng dạy hoàn tất trong tháng.\n` +
            `• Số liệu sẽ được chốt vào **23:59 ngày cuối tháng** để Quản lý quyết toán chi trả cho Giáo viên.`,
        };
      }
      return {
        text: `🎓 Giá thuê bàn phục vụ lớp học theo quy định là **${(dashboard.config.teacherPrice || 250000).toLocaleString('vi-VN')}đ / buổi 2 giờ** tại khu dạy học (bàn 1–4).`,
      };
    }

    // 3.2. [GIÁO VIÊN]: THỜI GIAN MỞ CỬA CỦA KHU DẠY HỌC
    if (/thời gian mở cửa của khu dạy học|thoi gian mo cua cua khu day hoc|khu dạy học mở cửa|giờ mở cửa khu dạy học|thời gian khu dạy học/i.test(text)) {
      return {
        text: `⏰ **Thời gian mở cửa & hoạt động của Khu dạy học:**\n` +
          `• Thời gian dành riêng cho lớp dạy: Từ **${String(dashboard.config.openingHour).padStart(2, '0')}:00 đến ${dashboard.config.classCutoffHour}:00** hàng ngày.\n` +
          `• Tất cả các lớp học phải kết thúc trước **${dashboard.config.classCutoffHour}:00**.\n` +
          `• Sau **${dashboard.config.classCutoffHour}:00**, các bàn khu dạy học (bàn 1–4) sẽ tự động mở để phục vụ khách vãng lai và khách tháng đặt bàn.`,
      };
    }

    // 3.3. [GIÁO VIÊN]: KHU DẠY HỌC CÒN MẤY BÀN TRỐNG
    if (/khu dạy học còn mấy bàn trống|khu day hoc con may ban trong|khu dạy học còn bao nhiêu bàn|bàn khu dạy học/i.test(text)) {
      const teachingAvailable = dashboard.tables.filter((t) => t.zone === 'teaching' && t.status === 'available').length;
      return {
        text: `🏓 **Tình trạng Khu dạy học (Bàn 1 đến 4):**\n` +
          `• Hiện tại còn **${teachingAvailable}/4 bàn đang trống**.\n` +
          `• Quy định: Mỗi lớp học được phân bổ 2 bàn trong 2 giờ và phải kết thúc trước ${dashboard.config.classCutoffHour}:00.\n` +
          `• Giáo viên có thể đăng ký đặt bàn phục vụ lớp học tại mục "Lớp dạy của tôi" để Quản lý phê duyệt.`,
      };
    }

    // 3.4. [GIÁO VIÊN]: ĐẶT BÀN PHỤC VỤ LỚP HỌC / LỊCH HỌC CỦA TÔI
    if (role === 'TEACHER' && (/đặt bàn phục vụ lớp|phục vụ lớp học|lịch học của tôi|lich hoc cua toi|lớp dạy của tôi/i.test(text))) {
      const myClasses = dashboard.classes.filter(
        (c) => c.teacherName === user.name || (user.id && (c as any).teacherId === user.id)
      );
      const approved = myClasses.filter((c) => c.status === 'approved').length;
      const pending = myClasses.filter((c) => c.status === 'pending').length;
      return {
        text: `🎓 **Thông tin Lớp dạy của bạn (${user.name}):**\n` +
          `• Thù lao định mức: **${(dashboard.config.teacherPrice || 250000).toLocaleString('vi-VN')}đ / buổi dạy 2 giờ**.\n` +
          `• Bạn có **${approved} lớp đã duyệt** và **${pending} lớp chờ duyệt**.\n` +
          `• Đặt bàn lớp học: Bàn 1–4 trong khung giờ từ 06:00 đến ${dashboard.config.classCutoffHour}:00. Vui lòng vào mục "Sân" hoặc "Lớp dạy của tôi" để đăng ký.`,
      };
    }

    // 3.5. [KHÁCH HÀNG]: GIÁ TIỀN CHƠI 1 TIẾNG LÀ BAO NHIÊU
    if (/giá tiền chơi 1 tiếng|gia tien choi 1 tieng|1 tiếng là bao nhiêu|1 tieng la bao nhieu|giá 1 tiếng|gia 1 tieng|tiền chơi 1 tiếng|tien choi 1 tieng|giá chơi 1 tiếng|thuê bàn theo giờ|thue ban theo gio/i.test(text)) {
      return {
        text: `💰 **Giá tiền chơi bóng bàn (Khách vãng lai):**\n` +
          `• Giá thuê bàn chơi theo giờ: **${dashboard.config.courtPrice.toLocaleString('vi-VN')}đ / người / giờ**.\n` +
          `• Lượt chơi tiêu chuẩn (2 giờ): **${(dashboard.config.courtPrice * 2).toLocaleString('vi-VN')}đ / người**.\n` +
          `*(Khách tháng đăng ký gói sẽ được trừ lượt theo gói và tiết kiệm đến 50% chi phí so với chơi lẻ).*`,
      };
    }

    // 3.6. [KHÁCH HÀNG]: GIÁ CỦA CÁC GÓI HỘI VIÊN & THÔNG TIN HỘI VIÊN
    if (/giá của các gói hội viên|gia cua cac goi hoi vien|giá các gói hội viên|gia cac goi hoi vien|gói hội viên|goi hoi vien|các gói hội viên/i.test(text)) {
      return {
        text: `🎟️ **Giá của các gói hội viên PingPongBros:**\n` +
          `• **Gói 1 tháng:** **449.000đ** (30 lượt chơi trong 30 ngày ~ 14.967đ/lượt 2h)\n` +
          `• **Gói 3 tháng:** **1.149.000đ** (90 lượt chơi trong 90 ngày ~ 12.767đ/lượt 2h)\n` +
          `• **Gói 6 tháng:** **1.999.000đ** (180 lượt chơi trong 180 ngày ~ 11.106đ/lượt 2h - Tiết kiệm nhất)\n` +
          `📌 *Quy định: Mỗi lượt chơi 2 giờ/bàn. Khi gia hạn, số lượt còn lại được cộng dồn vào gói mới. Đăng ký trực tiếp với nhân viên quầy!*`,
      };
    }

    if (role === 'MEMBER' && (/thông tin hội viên|thẻ của tôi|gói của tôi|lượt còn lại/i.test(text))) {
      const mem = dashboard.members.find((m) => m.id === user.memberId || m.phone === user.phone || m.email === user.email);
      if (mem) {
        const left = Math.max(0, mem.totalTurns - mem.usedTurns);
        return {
          text: `🎟️ **Thông tin Hội viên của bạn (${mem.name}):**\n` +
            `• Gói đang dùng: **${mem.packageType.toUpperCase()}** (${mem.totalTurns} lượt)\n` +
            `• Lượt chơi còn lại: **${left} / ${mem.totalTurns} lượt**\n` +
            `• Thời hạn: từ ${new Date(mem.startDate).toLocaleDateString('vi-VN')} đến ${new Date(mem.endDate).toLocaleDateString('vi-VN')}\n` +
            `• Trạng thái: ${left === 0 ? '⚠️ Hết lượt (hãy gia hạn để cộng dồn)' : left <= 5 ? '⚠️ Sắp hết lượt' : '✓ Đang hoạt động'}.`,
        };
      }
    }

    // 3.7. [KHÁCH HÀNG & CHUNG]: GIỜ MỞ CỬA
    if (/giờ mở cửa|gio mo cua|mấy giờ mở cửa|may gio mo cua|thời gian mở cửa|thoi gian mo cua|đóng cửa lúc mấy giờ/i.test(text)) {
      return {
        text: `⏰ **Giờ mở cửa CLB PingPongBros:**\n` +
          `• Giờ hoạt động: Từ **${String(dashboard.config.openingHour).padStart(2, '0')}:00 đến ${String(dashboard.config.closingHour).padStart(2, '0')}:00** hàng ngày (Thứ Hai đến Chủ Nhật).\n` +
          `• Bàn khu dạy học (Bàn 1–4): Mở tự do cho khách đặt sau **${dashboard.config.classCutoffHour}:00**.\n` +
          `• Hạn mức giữ bàn: Tối đa 15 phút so với giờ hẹn trước khi hệ thống tự động giải phóng bàn.`,
      };
    }

    // 3.8. [KHÁCH HÀNG & CHUNG]: CÒN MẤY BÀN TRỐNG
    if (/còn mấy bàn trống|con may ban trong|mấy bàn trống|may ban trong|bàn trống|ban trong|còn bàn không|con ban khong|tình trạng bàn/i.test(text)) {
      const available = dashboard.tables.filter((t) => t.status === 'available').length;
      const teachingAvailable = dashboard.tables.filter((t) => t.zone === 'teaching' && t.status === 'available').length;
      const regularAvailable = dashboard.tables.filter((t) => t.zone !== 'teaching' && t.status === 'available').length;
      return {
        text: `🏓 **Tình trạng bàn trống tại CLB PingPongBros:**\n` +
          `• Tổng số bàn trống hiện tại: **${available}/16 bàn** sẵn sàng đón khách.\n` +
          `• Khu đánh thường (Bàn 5 đến 16): **${regularAvailable}/12 bàn trống**.\n` +
          `• Khu dạy học (Bàn 1 đến 4): **${teachingAvailable}/4 bàn trống** (mở tự do cho khách sau ${dashboard.config.classCutoffHour}:00).\n` +
          `👉 Bạn có thể yêu cầu: *"Hãy giúp tôi điền form đặt bàn ngày mai lúc 17h cho 2 người trong 1 tiếng"* để tôi hỗ trợ lên lịch ngay!`,
      };
    }

    // 3.9. [NHÂN VIÊN & QUẢN LÝ]: TRA CỨU DOANH THU THEO PHÂN QUYỀN
    if (/doanh thu|doanh so|doanh_thu|thu nhap|tiền thu|doanh số|thu nhập|doanhthu|tổng doanh thu/i.test(text)) {
      // Khách vãng lai & Khách tháng: TUYỆT ĐỐI KHÔNG ĐƯỢC XEM
      if (role === 'GUEST' || role === 'MEMBER') {
        return {
          text: '⛔ **[Bảo mật] Quyền truy cập bị từ chối:** Tài khoản vai trò Khách hàng không có quyền xem thông tin doanh thu của câu lạc bộ. Bạn chỉ được hỏi về đặt bàn, giờ mở cửa, giá thuê bàn theo giờ, giá các gói hội viên và thông tin hội viên.',
        };
      }

      // Giáo viên: TUYỆT ĐỐI KHÔNG ĐƯỢC XEM
      if (role === 'TEACHER') {
        return {
          text: '⛔ **[Bảo mật] Quyền truy cập bị từ chối:** Tài khoản vai trò Giáo viên không có quyền xem doanh thu của câu lạc bộ. Bạn chỉ được hỏi về giá lớp học, lịch học và đặt bàn phục vụ lớp học.',
        };
      }

      // Nhân viên: CHỈ ĐƯỢC XEM DOANH THU NGÀY HÔM NAY
      if (role === 'STAFF') {
        if (/tuần|tuan|tháng|thang|quý|quy|năm|nam|toàn thời gian|tổng tích lũy/i.test(text)) {
          return {
            text: '⛔ **[Bảo mật] Giới hạn quyền truy cập Nhân viên:** Theo quy chế bảo mật, tài khoản Nhân viên **chỉ được xem doanh thu của ngày hiện tại (Hôm nay)**. Tuyệt đối không được xem doanh thu theo tuần, tháng, quý hoặc năm.',
          };
        }
        return {
          text: `📊 **Tổng doanh thu Ngày hôm nay (${todayStr}):**\n` +
            `• Số tiền đã thu hôm nay: **${todayRev.toLocaleString('vi-VN')}đ**\n` +
            `• Số giao dịch hôm nay: **${todayTxCount} giao dịch**\n\n` +
            `*(Lưu ý bảo mật: Tài khoản Nhân viên không được cấp quyền xem doanh thu theo tuần hoặc tháng).*`,
        };
      }

      // Quản lý: ĐƯỢC XEM TẤT CẢ (HÔM NAY / TUẦN / THÁNG / TỔNG)
      if (role === 'MANAGER') {
        return {
          text: `📈 **Báo cáo Tổng Doanh Thu Hệ Thống (Phân quyền Quản lý):**\n` +
            `• **Doanh thu Ngày hôm nay (${todayStr}):** ${todayRev.toLocaleString('vi-VN')}đ (${todayTxCount} giao dịch)\n` +
            `• **Doanh thu Tuần này:** ${weekRev.toLocaleString('vi-VN')}đ\n` +
            `• **Doanh thu Tháng này:** ${monthRev.toLocaleString('vi-VN')}đ\n` +
            `• **Tổng tích lũy toàn thời gian:** ${dashboard.stats.totalRevenue.toLocaleString('vi-VN')}đ (${payments.length} giao dịch).`,
        };
      }
    }

    // 3.10. Kiểm tra câu chào hỏi
    if (/^(chào|hi|hello|alo|xin chào|hey|bạn là ai|ban la ai|giới thiệu|gioi thieu)/i.test(text)) {
      return {
        text: `Xin chào ${user.name}! Tôi là Trợ lý AI-3 của PingPongBros. Tôi có thể hỗ trợ bạn tra cứu bàn trống, giờ mở cửa, giá tiền chơi, gói hội viên hoặc tự động điền form đặt bàn. Bạn cần hỗ trợ gì?`,
      };
    }

    // 4. NẾU KHÔNG ĐẠT NGƯỠNG ĐỘ TIN CẬY 80% HOẶC KHÔNG CÓ DỮ LIỆU XÁC THỰC:
    // Yêu cầu: "nếu đạt độ tin cậy thì AI sẽ làm việc còn không đạt ngưỡng thì chỉ khách hàng và giáo viên chuyển cho nhân viên, nhân viên không trả lời được thì chuyển qua quản lý."
    const isStaffUser = role === 'STAFF';
    return {
      text: `⚠️ Độ tin cậy cho câu hỏi này là **35%** (dưới ngưỡng quy định 80%) và không có dữ liệu xác thực trong hệ thống PingPongBros.\n\n` +
        `Theo quy chế bảo mật, Chatbot không được tự suy đoán hoặc cung cấp thông tin không có trong hệ thống.\n` +
        `Câu hỏi của bạn đã được chuyển tiếp tự động đến **${isStaffUser ? 'Quản lý' : 'Nhân viên trực quầy'}** để trực tiếp hỗ trợ giải đáp. Chatbot đã ngưng tham gia.`,
      transferredToStaff: true,
    };
  };

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    const id = Date.now();

    // NẾU HỘI THOẠI ĐÃ ĐƯỢC CHUYỂN TIẾP (MỤC 2): Chatbot KHÔNG ĐƯỢC THAM GIA, tin nhắn chuyển thẳng đến Nhân viên / Quản lý
    if (isMuted && transferredConv) {
      setMessages((current) => [...current, { id, role: 'user', text }]);
      setDraft('');
      try {
        await sendTransferredMessage(transferredConv.id, text, user.name);
      } catch {
        onNotify('Không thể kết nối đến nhân viên hỗ trợ.');
      }
      return;
    }

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

    // NẾU ĐỘ TIN CẬY DƯỚI 80%: TỰ ĐỘNG CHUYỂN TIẾP THEO PHÂN CẤP
    // - Khách hàng & Giáo viên: chuyển cho Nhân viên trực quầy (fallback Quản lý)
    // - Nhân viên: chuyển tiếp qua Quản lý
    if (response.transferredToStaff) {
      try {
        const transferRes = await transferConversation({
          customerId: user.id,
          customerName: user.name,
          customerEmail: user.email,
          customerPhone: user.phone,
          customerRole: user.role,
          confidence: response.extracted?.confidence ?? 35,
          reason: response.extracted
            ? `Bóc tách thông tin đạt ${response.extracted.confidence}% (< 80% ngưỡng quy định)`
            : `Độ tin cậy dưới 80% (${user.role === 'STAFF' ? 'Nhân viên chuyển tiếp cho Quản lý' : 'Khách hàng/Giáo viên chuyển tiếp cho Nhân viên quầy'})`,
          messages: [...messages, { role: 'user', text }],
        });

        if (transferRes.ok && transferRes.conversation) {
          setTransferredConv(transferRes.conversation);
          setIsMuted(true); // Chatbot ngưng tham gia cuộc hội thoại theo đặc tả
          onNotify(`Đã chuyển tiếp cuộc hội thoại đến ${transferRes.assignedTo.name} (${transferRes.assignedTo.role === 'STAFF' ? 'Nhân viên hỗ trợ' : 'Quản lý'}).`);
        }
      } catch (err) {
        console.error('Lỗi khi chuyển tiếp hội thoại:', err);
      }
    }
  };

  const handleOpenBookingForm = (extracted: ExtractedBooking) => {
    setOpen(false);
    onNavigate('san');
    window.dispatchEvent(new CustomEvent('ai3-fill-booking', { detail: extracted }));
    onNotify(`Đã hỗ trợ điền thông tin vào Form Đặt Bàn. Bạn vui lòng kiểm tra lại thông tin và tự nhấn nút "Xác nhận đặt bàn".`);
  };

  // Câu hỏi gợi ý hiển thị chuẩn hóa theo từng vai trò tài khoản theo đúng yêu cầu đề bài
  const quickQuestions = user.role === 'TEACHER'
    ? [
        'Khu dạy học còn mấy bàn trống',
        'Giá của một buổi dạy là bao nhiêu',
        'Thời gian mở cửa của khu dạy học',
        'Hãy giúp tôi điền form đặt bàn ngày/giờ/người/thời lượng',
      ]
    : user.role === 'STAFF'
      ? [
          'Hãy giúp tôi điền form đặt bàn ngày/giờ/người/thời lượng',
          'Tổng doanh thu ngày hôm nay',
          'Còn mấy bàn trống',
        ]
      : user.role === 'MANAGER'
        ? [
            'Hãy giúp tôi điền form đặt bàn ngày/giờ/người/thời lượng',
            'Tổng doanh thu ngày hôm nay/ tuần/ tháng',
            'Còn mấy bàn trống',
            'Khu dạy học còn mấy bàn trống',
          ]
        : [
            'Còn mấy bàn trống',
            'Giá tiền chơi 1 tiếng là bao nhiêu',
            'Giờ mở cửa',
            'Giá của các gói hội viên',
            'Hãy giúp tôi điền form đặt bàn ngày/giờ/người/thời lượng',
          ];

  return (
    <>
      {open && (
        <section className="bot" role="dialog" aria-label="Trợ lý đặt bàn AI">
          <div className="bot-h">
            <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{isMuted && transferredConv ? 'Hỗ trợ trực tiếp' : 'Trợ lý đặt bàn'}</span>
              <span className="tag" style={{ background: isMuted ? '#ef4444' : '#ffffff33', color: '#fff' }}>
                {isMuted ? 'LIVE AGENT' : 'AI-3 NLP'}
              </span>
            </b>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {isMuted && (
                <button
                  className="btn sm ghost"
                  type="button"
                  title="Chuyển lại về Chatbot AI"
                  style={{ color: '#fff', fontSize: 11, padding: '2px 6px' }}
                  onClick={() => {
                    setIsMuted(false);
                    setTransferredConv(null);
                    onNotify('Đã kích hoạt lại Trợ lý AI-3.');
                  }}
                >
                  ↺ Chatbot AI
                </button>
              )}
              <button className="btn sm ghost" type="button" aria-label="Đóng trợ lý" onClick={() => setOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
          <div className="bot-st" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Xin chào, {user.name}</span>
            <span className="tag" style={{ background: '#0284c7', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
              🔒 {user.role === 'MANAGER' ? 'Quản lý (Toàn quyền)' : user.role === 'STAFF' ? 'Nhân viên' : user.role === 'TEACHER' ? 'Giáo viên' : user.role === 'MEMBER' ? 'Khách tháng' : 'Khách vãng lai'}
            </span>
          </div>
          {isMuted && transferredConv && (
            <div style={{ padding: '6px 12px', background: '#ecfdf5', borderBottom: '1px solid #10b981', fontSize: 12, color: '#047857', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🟢 Đang kết nối: <b>{transferredConv.assignedTo.name}</b> ({transferredConv.assignedTo.role === 'STAFF' ? 'Nhân viên' : 'Quản lý'})</span>
              <span style={{ fontSize: 10, background: '#d1fae5', padding: '1px 4px', borderRadius: 3 }}>Mã: {transferredConv.id.slice(0, 15)}</span>
            </div>
          )}
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
                    <b>{user.role === 'STAFF' ? '👑 Đã chuyển câu hỏi đến Quản lý:' : '👨‍💼 Đã chuyển câu hỏi đến Nhân viên hỗ trợ:'}</b> Độ tin cậy dưới ngưỡng quy định 80% hoặc câu hỏi không có dữ liệu xác thực trong hệ thống. {user.role === 'STAFF' ? 'Quản lý' : 'Nhân viên quầy'} đã tiếp nhận thông tin và sẽ hỗ trợ giải đáp trực tiếp cho bạn!
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
              <button key={question} type="button" onClick={() => sendMessage(question)}>
                {question}
              </button>
            ))}
          </div>

          <form className="bot-f" onSubmit={(e) => { e.preventDefault(); sendMessage(draft); }}>
            <input
              className="in"
              placeholder={isMuted && transferredConv ? `Nhắn tin trực tiếp với ${transferredConv.assignedTo.name}...` : 'Nhập yêu cầu: tối mai 7h cho 4 người...'}
              autoComplete="off"
              aria-label="Tin nhắn"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="btn" type="submit" style={isMuted ? { background: '#10b981', borderColor: '#059669' } : {}}>
              {isMuted ? 'Gửi tư vấn' : 'Gửi'}
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
