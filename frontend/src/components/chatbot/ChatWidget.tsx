import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DashboardResponse, User } from '../../types';
import type { PageId } from '../layout/Shell';

interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  action?: { label: string; page: PageId };
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
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [messages, open]);

  const answer = (raw: string) => {
    const text = raw.toLocaleLowerCase();
    if (/giá|bao nhiêu tiền|chi phí/.test(text)) {
      return `Chơi lẻ ${dashboard.config.courtPrice.toLocaleString('vi-VN')}đ/người/giờ, mặc định 2 giờ. Ví dụ 2 người chơi 2 giờ: ${(2 * 2 * dashboard.config.courtPrice).toLocaleString('vi-VN')}đ.`;
    }
    if (/giờ|mở cửa/.test(text)) {
      return `CLB mở cửa ${String(dashboard.config.openingHour).padStart(2, '0')}:00–${String(dashboard.config.closingHour).padStart(2, '0')}:00.`;
    }
    if (/gói|tháng|hội viên/.test(text)) return 'Gói tháng: 1 tháng 449.000đ · 3 tháng 1.149.000đ · 6 tháng 1.999.000đ. Mỗi tháng gồm 30 lượt.';
    if (/bàn|trống|còn chỗ/.test(text)) {
      const available = dashboard.tables.filter((table) => table.status === 'available').length;
      return `Theo dữ liệu sân hiện tại có ${available} bàn được đánh dấu trống. Để xem chi tiết theo thời gian, mở sơ đồ sân.`;
    }
    if (/lớp|giáo viên/.test(text)) {
      return `Lớp học sử dụng 2 bàn khu dạy học và phải kết thúc trước ${dashboard.config.classCutoffHour}:00.`;
    }
    return 'Mình có thể hỗ trợ về đặt bàn, tình trạng sân, giá chơi, gói tháng, giờ mở cửa và lớp học. Câu hỏi ngoài các thông tin này cần nhân viên hỗ trợ.';
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    setMessages((current) => [...current, { id, role: 'user', text }, { id: id + 1, role: 'assistant', text: answer(text) }]);
    setDraft('');
  };

  const quickQuestions = user.role === 'TEACHER'
    ? ['Đặt lớp học thế nào?', 'Giờ mở cửa?', 'Giá một lượt dạy?']
    : user.role === 'STAFF' || user.role === 'MANAGER'
      ? ['Còn bàn trống không?', 'Gói tháng giá thế nào?', 'Đặt bàn thế nào?']
      : ['Còn bàn trống không?', 'Giá chơi bao nhiêu?', 'Gói tháng giá thế nào?', 'Giờ mở cửa?'];

  const askQuestion = (question: string) => {
    const id = Date.now();
    setMessages((current) => [...current, { id, role: 'user', text: question }, { id: id + 1, role: 'assistant', text: answer(question) }]);
  };

  return (
    <>
      {open && <section className="bot" role="dialog" aria-label="Trợ lý đặt bàn AI">
        <div className="bot-h"><b>Trợ lý đặt bàn <span className="tag" style={{ background: '#ffffff33', color: '#fff' }}>AI-3</span></b><button className="btn sm ghost" type="button" aria-label="Đóng trợ lý" onClick={() => setOpen(false)}>Đóng</button></div>
        <div className="bot-st"><span>Xin chào, {user.name.split(/\s+/).slice(-1)[0]}</span></div>
        <div className="bot-m" ref={thread} aria-live="polite">
          {!messages.length && <div className="msg b">Xin chào! Hãy hỏi về đặt bàn, tình trạng sân, giá, gói tháng hoặc giờ hoạt động của CLB.</div>}
          {messages.map((message) => <div key={message.id} className={`msg ${message.role === 'assistant' ? 'b' : 'u'}`}>{message.text}{message.action && <div className="btns"><button className="btn sm red" type="button" onClick={() => onNavigate(message.action!.page)}>{message.action.label}</button></div>}</div>)}
        </div>
        <div className="faq" aria-label="Câu hỏi thường gặp">{quickQuestions.map((question) => <button key={question} type="button" onClick={() => askQuestion(question)}>{question}</button>)}<button className="hum" type="button" onClick={() => onNotify('Yêu cầu hỗ trợ trực tiếp chưa được kết nối với API.')}>Gặp nhân viên</button></div>
        <form className="bot-f" onSubmit={send}><input className="in" placeholder="Nhập yêu cầu hoặc câu hỏi..." autoComplete="off" aria-label="Tin nhắn" value={draft} onChange={(event) => setDraft(event.target.value)} /><button className="btn" type="submit">Gửi</button></form>
      </section>}
      <button className="bot-fab" type="button" aria-label={open ? 'Đóng trợ lý đặt bàn AI' : 'Mở trợ lý đặt bàn AI'} title="Trợ lý đặt bàn AI" onClick={() => setOpen((value) => !value)}>
        <Paddle size={34} />
      </button>
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
