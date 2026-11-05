import { useMemo, useState, type FormEvent } from 'react';
import { checkInBooking, checkOutBooking, createBooking, createClassSession, createWaitlist, fetchDashboard } from '../services/api';
import type { Booking, DashboardResponse, TableInfo, User } from '../types';
import { venueNow } from '../utils/time';
import { validateCustomerContact } from '../utils/validation';
import { BookingSuccessModal, type BookingSuccessInfo } from '../components/common/BookingSuccessModal';

type CourtState = 'trong' | 'dat' | 'choi' | 'lop' | 'hoc' | 'dong';
type CourtStatus = { state: CourtState; booking?: Booking; className?: string; end?: number };
type Filter = 'all' | CourtState;

const stateLabels: Record<CourtState, string> = {
  trong: 'Trống',
  dat: 'Đã đặt',
  choi: 'Đang chơi',
  lop: 'Đang dạy',
  hoc: 'Khu dạy học',
  dong: 'Đóng cửa',
};
const bookingLabels: Record<Booking['status'], [string, string]> = {
  PENDING: ['Chờ xác nhận', 't-am'],
  CONFIRMED: ['Đã xác nhận', 't-bl'],
  CHECKED_IN: ['Đang chơi', 't-rd'],
  CHECKED_OUT: ['Hoàn thành', 't-ok'],
  CANCELLED: ['Đã hủy', 't-gr'],
};
const money = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')}đ`;
const timeText = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const dateText = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface CourtPageProps {
  dashboard: DashboardResponse;
  user: User;
  demoClock: boolean;
  onNotify: (message: string) => void;
}

export function CourtPage({ dashboard, user, demoClock, onNotify }: CourtPageProps) {
  const isStaff = user.role === 'MANAGER' || user.role === 'STAFF';
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [date, setDate] = useState(() => dayKey(venueNow(demoClock)));
  const [time, setTime] = useState(() => timeText(venueNow(demoClock)));
  const [live, setLive] = useState(true);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(dashboard);
  const [successModal, setSuccessModal] = useState<BookingSuccessInfo | null>(null);
  const viewedAt = live ? venueNow(demoClock) : new Date(`${date}T${time || '06:00'}:00`);

  const getStatus = (table: TableInfo): CourtStatus => {
    const hour = viewedAt.getHours() + viewedAt.getMinutes() / 60;
    const opening = data.config.openingHour;
    const closing = data.config.closingHour;
    if (hour < opening || hour >= closing) return { state: 'dong' };

    const classSession = data.classes.find((item) => {
      if (item.status !== 'approved' || !item.tables.includes(table.tableNumber)) return false;
      const start = new Date(item.date);
      return dayKey(start) === dayKey(viewedAt) && hour >= item.startHour && hour < item.endHour;
    });
    if (classSession) return { state: 'lop', className: classSession.teacherName, end: classSession.endHour };

    const booking = data.bookings.find((item) => {
      if (item.tableId !== table.tableNumber || !['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(item.status)) return false;
      const start = new Date(item.startTime);
      const end = new Date(start.getTime() + item.duration * 60 * 60 * 1000);
      return viewedAt >= start && viewedAt < end;
    });
    if (booking) {
      return {
        state: booking.status === 'CHECKED_IN' ? 'choi' : 'dat',
        booking,
        end: new Date(new Date(booking.startTime).getTime() + booking.duration * 60 * 60 * 1000).getTime(),
      };
    }

    if (live && table.status === 'busy') return { state: 'choi' };
    if (table.zone === 'teaching' && hour < data.config.classCutoffHour) return { state: 'hoc' };
    return { state: 'trong' };
  };

  const counts = useMemo(() => {
    const result = { trong: 0, dat: 0, choi: 0, lop: 0 };
    data.tables.forEach((table) => {
      const state = getStatus(table).state;
      if (state in result) result[state as keyof typeof result] += 1;
    });
    return result;
  }, [data, date, time, live]);

  const refresh = async () => {
    const fresh = await fetchDashboard();
    setData(fresh);
  };

  const selected = data.tables.find((table) => table.tableNumber === selectedTable) ?? null;

  const handleCheckIn = async (bookingId: number) => {
    try {
      await checkInBooking(bookingId);
      await refresh();
      onNotify('Check-in thành công cho lượt đặt #' + bookingId);
    } catch {
      onNotify('Lỗi khi thực hiện check-in.');
    }
  };

  const handleCheckOut = async (bookingId: number) => {
    try {
      const res = await checkOutBooking(bookingId);
      await refresh();
      setSelectedTable(null);
      onNotify(res.message || 'Check-out hoàn tất.');
    } catch {
      onNotify('Lỗi khi thực hiện check-out.');
    }
  };

  return (
    <>
      <div className="pg-h">
        <div>
          <h2>Sơ đồ sân</h2>
          <p>{isStaff ? 'Theo dõi thời gian thực, check-in và check-out ngay trên sân. Bấm vào bàn để xem chi tiết.' : user.role === 'TEACHER' ? 'Xem sân và đặt bàn lớp học ở khu dạy học. Hệ thống tự phân 2 bàn cho lớp.' : 'Xem sân theo ngày giờ và đặt bàn. Hệ thống tự phân bàn trống cho bạn.'}</p>
        </div>
        <div className="legend">
          {(['trong', 'dat', 'choi', 'lop'] as CourtState[]).map((state) => <span className={`tag st-${state}`} key={state}>{stateLabels[state]}</span>)}
          <span className="tag st-hoc">Khu dạy học / đóng cửa</span>
        </div>
      </div>

      <div className="two">
        <section className="card" aria-label="Xem sân">
          <div className="fg">
            <div><label htmlFor="court-date">Ngày</label><input className="in" type="date" id="court-date" min={isStaff ? undefined : dayKey(new Date())} value={date} onChange={(event) => { setDate(event.target.value); setLive(false); }} /></div>
            <div><label htmlFor="court-time">Giờ</label><div className="row-in"><input className="in" type="time" id="court-time" value={time} onChange={(event) => { setTime(event.target.value); setLive(false); }} /><button className="btn ghost sm" type="button" onClick={() => { const now = venueNow(demoClock); setDate(dayKey(now)); setTime(timeText(now)); setLive(true); }}>Bây giờ</button></div></div>
          </div>
          <p className="hint" style={{ margin: '8px 0 12px' }}>
            <span className={`tag ${live ? 't-ok' : 't-am'}`}>{live ? 'Thời gian thực' : `Đang xem ${time} · ${dateText(`${date}T00:00:00`)}`}</span>
            {' '}{live ? 'Bản đồ tự cập nhật theo dữ liệu hiện tại.' : 'Bấm "Bây giờ" để về thời gian thực.'}
          </p>
          {isStaff && <StaffSearch value={search} onChange={setSearch} bookings={data.bookings} onSelect={(booking) => setSelectedTable(booking.tableId)} onCheckIn={handleCheckIn} />}
          <label>Trạng thái sân</label>
          <div className="chips" role="group" aria-label="Lọc trạng thái">
            {([
              ['all', 'Tất cả', 16],
              ['trong', 'Trống', counts.trong],
              ['dat', 'Đã đặt', counts.dat],
              ['choi', 'Đang chơi', counts.choi],
              ['lop', 'Đang dạy', counts.lop],
            ] as [Filter, string, number][]).map(([id, label, count]) => (
              <button className="fchip" type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <b>{count}</b></button>
            ))}
          </div>

          <div className="court-map">
            {Array.from({ length: 4 }, (_, row) => (
              <div className="row-d" key={row}>
                <small>Dãy {row + 1}{row === 0 ? ` · khu dạy học (mở cho khách sau ${data.config.classCutoffHour}:00)` : ''}</small>
                <div className="row-t">
                  {data.tables.filter((table) => Math.floor((table.tableNumber - 1) / 4) === row).map((table) => {
                    const status = getStatus(table);
                    const dimmed = filter !== 'all' && filter !== status.state;
                    const description = status.booking ? `${status.booking.customerName} · đến ${timeText(new Date(status.end ?? Date.now()))}` : status.className ? `${status.className} · đến ${status.end}:00` : '';
                    const content = <><span className="n">{table.tableNumber}</span><span className="s">{stateLabels[status.state]}</span><span className="w">{description}</span></>;
                    return isStaff ? (
                      <button key={table.id} className={`tile st-${status.state}${dimmed ? ' dim' : ''}`} type="button" data-t={table.tableNumber} aria-pressed={selectedTable === table.tableNumber} aria-label={`Bàn ${table.tableNumber}, ${stateLabels[status.state]}`} onClick={() => setSelectedTable(selectedTable === table.tableNumber ? null : table.tableNumber)}>{content}</button>
                    ) : (
                      <div key={table.id} className={`tile st-${status.state}${dimmed ? ' dim' : ''}`} role="img" aria-label={`Bàn ${table.tableNumber}, ${stateLabels[status.state]}`}>{content}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="col">
          <section className="card" aria-label={isStaff && selected ? 'Chi tiết bàn' : 'Đặt bàn'}>
            {isStaff && selected
              ? <CourtDetail table={selected} status={getStatus(selected)} config={data.config} onBack={() => setSelectedTable(null)} onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} />
              : user.role === 'TEACHER'
                ? <ClassRequest config={data.config} onNotify={onNotify} onRefresh={refresh} user={user} />
                : <BookingForm dashboard={data} user={user} onNotify={onNotify} onRefresh={refresh} onSuccessBooking={(info) => setSuccessModal(info)} />}
          </section>
          <section className="card">
            {isStaff
              ? <WaitlistPanel bookings={data.bookings} />
              : <MyBookings bookings={data.bookings.filter((booking) => booking.phone === user.phone)} />}
          </section>
        </div>
      </div>
      {successModal && <BookingSuccessModal info={successModal} onClose={() => setSuccessModal(null)} />}
    </>
  );
}

function CourtDetail({ table, status, config, onBack, onCheckIn, onCheckOut }: { table: TableInfo; status: CourtStatus; config: DashboardResponse['config']; onBack: () => void; onCheckIn: (id: number) => void; onCheckOut: (id: number) => void }) {
  const booking = status.booking;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div><small className="hint">Chi tiết bàn</small><div className="pill-big">{table.tableNumber}</div></div>
        <span className={`tag st-${status.state}`}>{stateLabels[status.state]}</span>
      </div>
      {booking ? (
        <dl className="det">
          <dt>Tên khách</dt><dd>{booking.customerName}</dd>
          <dt>Loại khách</dt><dd>{booking.type === 'MEMBER' ? 'Khách tháng' : booking.type === 'TEACHER' ? 'Giáo viên' : 'Khách vãng lai'}</dd>
          <dt>Số người chơi</dt><dd>{booking.people}</dd>
          <dt>Thời gian bắt đầu</dt><dd>{timeText(new Date(booking.startTime))}</dd>
          <dt>Thời lượng</dt><dd>{booking.duration} giờ</dd>
          <dt>Dự kiến kết thúc</dt><dd>{timeText(new Date(status.end ?? Date.now()))}</dd>
          <dt>Trạng thái đặt</dt><dd>{bookingLabels[booking.status][0]}</dd>
        </dl>
      ) : status.state === 'lop' ? (
        <p className="hint" style={{ margin: '10px 0' }}>{status.className} đang sử dụng bàn này. Lớp kết thúc lúc {status.end}:00.</p>
      ) : status.state === 'trong' ? (
        <p className="hint" style={{ margin: '10px 0' }}>Bàn trống lúc {timeText(new Date())}. Sức chứa tối đa {table.capacity} người.</p>
      ) : status.state === 'hoc' ? (
        <p className="hint" style={{ margin: '10px 0' }}>Bàn thuộc khu dạy học. Chỉ mở cho khách sau {config.classCutoffHour}:00 và khi không có lớp.</p>
      ) : (
        <p className="hint" style={{ margin: '10px 0' }}>Ngoài giờ mở cửa ({String(config.openingHour).padStart(2, '0')}:00 – {String(config.closingHour).padStart(2, '0')}:00).</p>
      )}

      {/* Thao tác Check-in / Check-out trực tiếp trên màn hình sân */}
      {booking && (booking.status === 'CHECKED_IN' || status.state === 'choi') && (
        <button className="btn red" style={{ width: '100%', marginTop: 12 }} type="button" onClick={() => onCheckOut(booking.id)}>
          Check-out và kết thúc lượt
        </button>
      )}
      {booking && (booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
        <button className="btn" style={{ width: '100%', marginTop: 12, background: 'var(--brand)' }} type="button" onClick={() => onCheckIn(booking.id)}>
          Check-in nhận bàn
        </button>
      )}

      <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} type="button" onClick={onBack}>Về khung đặt bàn</button>
    </>
  );
}

function StaffSearch({ value, onChange, bookings, onSelect, onCheckIn }: { value: string; onChange: (value: string) => void; bookings: Booking[]; onSelect: (booking: Booking) => void; onCheckIn: (id: number) => void }) {
  const matches = bookings.filter((booking) => ['CONFIRMED', 'PENDING', 'CHECKED_IN'].includes(booking.status) && `${booking.customerName} ${booking.phone} ${booking.id}`.toLowerCase().includes(value.toLowerCase())).slice(0, 6);
  return (
    <>
      <label htmlFor="court-search">Check-in</label>
      <input className="in" id="court-search" placeholder="Tìm theo tên, mã bàn hoặc SĐT" value={value} onChange={(event) => onChange(event.target.value)} />
      {value && <ul className="res-list">{matches.map((booking) => (
        <li key={booking.id}>
          <span><b>Bàn {booking.tableId}</b> · {booking.customerName}<br /><small className="hint">#{booking.id} · {booking.phone} · {timeText(new Date(booking.startTime))}</small></span>
          <div style={{ display: 'flex', gap: 6 }}>
            {booking.status !== 'CHECKED_IN' && (
              <button className="btn sm" type="button" onClick={() => onCheckIn(booking.id)}>Check-in</button>
            )}
            <button className="btn sm ghost" type="button" onClick={() => onSelect(booking)}>{booking.status === 'CHECKED_IN' ? 'Xem bàn' : 'Chi tiết'}</button>
          </div>
        </li>
      ))}{!matches.length && <li><span className="hint">Không tìm thấy lượt đặt phù hợp.</span></li>}</ul>}
      <div style={{ height: 12 }} />
    </>
  );
}

function BookingForm({ dashboard, user, onNotify, onRefresh, onSuccessBooking }: { dashboard: DashboardResponse; user: User; onNotify: (message: string) => void; onRefresh: () => Promise<void>; onSuccessBooking: (info: BookingSuccessInfo) => void }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [bookingDate, setBookingDate] = useState(dayKey(new Date()));
  const [startTime, setStartTime] = useState(() => timeText(new Date()));
  const [duration, setDuration] = useState(dashboard.config.defaultHours);
  const [people, setPeople] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [noTableWarning, setNoTableWarning] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [forceWalkIn, setForceWalkIn] = useState(false);

  // Kiểm tra thông tin gói của khách tháng
  const memberInfo = dashboard.members.find((m) => m.id === user.memberId || m.phone === user.phone);
  const leftTurns = memberInfo ? Math.max(0, memberInfo.totalTurns - memberInfo.usedTurns) : 0;
  const isMemberExpired = user.role === 'MEMBER' && !forceWalkIn && leftTurns <= 0;
  const estimatedTurns = Math.max(1, Math.ceil(duration / 2));

  const isWalkIn = user.role !== 'MEMBER' || forceWalkIn;
  const cost = people * duration * dashboard.config.courtPrice;
  const endTime = (() => {
    const [hour, minute] = startTime.split(':').map(Number);
    const total = hour * 60 + minute + duration * 60;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  })();

  // Kiểm tra bàn có trống trong khoảng thời gian [start, start + duration]
  const isTableAvailable = (tableNumber: number, targetDate: string, targetTime: string, dur: number): boolean => {
    const reqStart = new Date(`${targetDate}T${targetTime}:00`).getTime();
    const reqEnd = reqStart + dur * 3600000;
    const startH = new Date(`${targetDate}T${targetTime}:00`).getHours();

    // Bàn khu dạy học (1-4) chỉ mở cho khách sau 19:00
    if (tableNumber >= 1 && tableNumber <= 4 && startH < dashboard.config.classCutoffHour) {
      return false;
    }

    // 1. Kiểm tra trùng booking khác
    const hasBookingConflict = dashboard.bookings.some((b) => {
      if (b.tableId !== tableNumber) return false;
      if (['CANCELLED', 'CHECKED_OUT'].includes(b.status)) return false;
      const bStart = new Date(b.startTime).getTime();
      const bEnd = bStart + b.duration * 3600000;
      return !(reqEnd <= bStart || reqStart >= bEnd);
    });
    if (hasBookingConflict) return false;

    // 2. Kiểm tra trùng lớp học đã duyệt
    const hasClassConflict = dashboard.classes.some((c) => {
      if (c.status !== 'approved' || !c.tables.includes(tableNumber)) return false;
      if (dayKey(new Date(c.date)) !== targetDate) return false;
      const endH = startH + dur;
      return !(endH <= c.startHour || startH >= c.endHour);
    });

    return !hasClassConflict;
  };

  // AI-1: Đề xuất các khung giờ thay thế có bàn trống lân cận
  const findAlternativeHours = (targetDate: string, targetTime: string, dur: number): string[] => {
    const [targetH] = targetTime.split(':').map(Number);
    const candidates = [targetH - 1, targetH + 1, targetH - 2, targetH + 2];
    const availableHours: string[] = [];

    for (const h of candidates) {
      if (h >= dashboard.config.openingHour && h + dur <= dashboard.config.closingHour) {
        const timeStr = `${String(h).padStart(2, '0')}:00`;
        const hasAvailable = dashboard.tables.some((t) => isTableAvailable(t.tableNumber, targetDate, timeStr, dur));

        if (hasAvailable && !availableHours.includes(timeStr)) {
          availableHours.push(timeStr);
        }
      }
    }
    return availableHours.slice(0, 3);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNoTableWarning(false);
    const contactValidation = validateCustomerContact(name, phone, email, true);
    if (!contactValidation.valid) {
      onNotify(contactValidation.errors[0]);
      return;
    }

    if (isMemberExpired) {
      onNotify('Gói tháng của bạn đã hết lượt chơi. Hãy gia hạn gói hoặc chọn đặt dưới tư cách khách vãng lai.');
      return;
    }

    const errors: string[] = [];
    if (!bookingDate || !startTime) errors.push('Chọn ngày và giờ bắt đầu.');
    if (people < 1 || people > dashboard.config.maxPeoplePerTable) errors.push(`Mỗi bàn tối đa ${dashboard.config.maxPeoplePerTable} người.`);
    const start = new Date(`${bookingDate}T${startTime}:00`);
    const now = new Date();
    if (start < now) errors.push('Giờ bắt đầu đã qua, vui lòng chọn giờ khác.');
    if (start.getHours() < dashboard.config.openingHour || start.getHours() + duration > dashboard.config.closingHour) errors.push('Thời lượng phải nằm trong giờ mở cửa.');

    if (errors.length) {
      onNotify(errors[0]);
      return;
    }

    // Thuật toán tìm bàn trống chống trùng giờ: ưu tiên bàn 5-16 trước, sau 19h mới chọn 1-4
    const candidateTableNumbers = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1, 2, 3, 4];
    const freeTableNumber = candidateTableNumbers.find((tNum) => isTableAvailable(tNum, bookingDate, startTime, duration));

    if (!freeTableNumber) {
      const suggestions = findAlternativeHours(bookingDate, startTime, duration);
      setAiSuggestions(suggestions);
      setNoTableWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createBooking({
        tableId: freeTableNumber,
        customerName: name.trim(),
        phone,
        email,
        type: isWalkIn ? 'WALK_IN' : 'MEMBER',
        startTime: start.toISOString(),
        duration,
        people,
        amount: isWalkIn ? cost : 0,
        memberId: isWalkIn ? null : (user.memberId ?? null),
      });
      await onRefresh();
      onSuccessBooking({
        bookingId: created?.id || dashboard.bookings.length + 1,
        tableNumber: freeTableNumber,
        customerName: name.trim(),
        phone,
        date: bookingDate,
        startTime,
        duration,
        people,
        amount: isWalkIn ? cost : 0,
        isMember: !isWalkIn,
      });
      onNotify(`Đặt bàn thành công: Bàn ${freeTableNumber} · ${bookingDate} ${startTime} (${duration} giờ).`);
    } catch (reason: any) {
      const msg = reason?.response?.data?.message || (reason instanceof Error ? reason.message : 'Không thể tạo lượt đặt.');
      onNotify(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToWaitlist = async () => {
    setSubmitting(true);
    try {
      const start = new Date(`${bookingDate}T${startTime}:00`);
      await createWaitlist({
        customerName: name.trim(),
        phone,
        email,
        people,
        startTime: start.toISOString(),
        duration,
        type: isWalkIn ? 'WALK_IN' : 'MEMBER',
      });
      await onRefresh();
      setNoTableWarning(false);
      onNotify('Đã thêm khách vào danh sách chờ. Hệ thống sẽ tự động gán bàn khi có bàn trống phù hợp!');
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : 'Lỗi khi thêm vào danh sách chờ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h3>Đặt bàn</h3>
      <p className="hint" style={{ marginTop: 4 }}>
        Hệ thống tự phân bàn trống chống trùng lịch. Mặc định chơi 2 giờ, tối đa {dashboard.config.maxPeoplePerTable} người mỗi bàn.
      </p>

      {/* Cảnh báo khi khách tháng hết 30 lượt */}
      {isMemberExpired && (
        <div className="alert" style={{ background: '#fdedec', borderColor: '#c0392b', color: '#922b21', margin: '12px 0', padding: 12, borderRadius: 8 }}>
          <b>⚠️ Gói tháng của bạn đã hết lượt chơi (0/{memberInfo?.totalTurns} lượt)!</b>
          <p style={{ margin: '6px 0 10px', fontSize: 13 }}>
            Theo quy định, bạn không thể tiếp tục đặt bàn miễn phí bằng gói. Bạn có thể nhờ nhân viên gia hạn gói (cộng dồn lượt) hoặc đặt bàn theo chế độ khách vãng lai:
          </p>
          <button className="btn sm red" type="button" onClick={() => setForceWalkIn(true)}>
            Chuyển sang đặt kiểu Khách vãng lai ({money(dashboard.config.courtPrice)}/người/giờ)
          </button>
        </div>
      )}

      {forceWalkIn && user.role === 'MEMBER' && (
        <div style={{ padding: '6px 10px', background: '#fef9e7', border: '1px solid #f39c12', borderRadius: 6, margin: '8px 0', fontSize: 13, color: '#7d6608' }}>
          Đang đặt dưới hình thức: <b>Khách vãng lai</b> (tính phí theo giờ). <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => setForceWalkIn(false)}>Hủy</button>
        </div>
      )}

      {noTableWarning && (
        <div className="alert" style={{ background: '#fdf2e9', borderColor: '#e08a3c', color: '#8a4b08', margin: '12px 0', padding: 12, borderRadius: 8 }}>
          <b>⚠️ Hiện tại khung giờ {startTime} ({bookingDate}) đã hết bàn trống!</b>
          {aiSuggestions.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px dashed #e08a3c' }}>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--brand)' }}>🤖 AI-1 Đề xuất khung giờ thay thế:</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {aiSuggestions.map((sugg) => (
                  <button
                    key={sugg}
                    type="button"
                    className="btn sm"
                    style={{ background: '#1d4ba8', color: '#fff', fontSize: 12 }}
                    onClick={() => {
                      setStartTime(sugg);
                      setNoTableWarning(false);
                      onNotify(`Đã chuyển sang khung giờ gợi ý của AI: ${sugg}. Bạn có thể bấm Đặt bàn.`);
                    }}
                  >
                    Đổi sang {sugg}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p style={{ margin: '8px 0 10px', fontSize: 13 }}>Hoặc thêm khách vào danh sách chờ để tự động nhận bàn ngay khi có bàn trống:</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm red" type="button" onClick={handleAddToWaitlist} disabled={submitting}>
              Thêm vào hàng chờ
            </button>
            <button className="btn sm ghost" type="button" onClick={() => setNoTableWarning(false)}>
              Hủy
            </button>
          </div>
        </div>
      )}

      <form noValidate style={{ marginTop: 12 }} onSubmit={submit}>
        <div className="fg">
          <div className="full"><label htmlFor="bk-name">Họ tên khách</label><input className="in" id="bk-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div><label htmlFor="bk-phone">Số điện thoại</label><input className="in" id="bk-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          <div><label htmlFor="bk-email">Email (không bắt buộc)</label><input className="in" id="bk-email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div><label htmlFor="bk-date">Ngày</label><input className="in" type="date" id="bk-date" value={bookingDate} min={dayKey(new Date())} onChange={(event) => setBookingDate(event.target.value)} /></div>
          <div><label htmlFor="bk-time">Giờ bắt đầu</label><select className="in" id="bk-time" value={startTime} onChange={(event) => setStartTime(event.target.value)}>{Array.from({ length: (dashboard.config.closingHour - dashboard.config.openingHour) * 2 }, (_, index) => { const mins = dashboard.config.openingHour * 60 + index * 30; const value = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; return <option key={value} value={value}>{value}</option>; })}</select></div>
          <div><label htmlFor="bk-dur">Thời lượng</label><select className="in" id="bk-dur" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{[1, 1.5, 2, 2.5, 3, 3.5, 4].map((hours) => <option key={hours} value={hours}>{hours % 1 ? `${Math.floor(hours)} giờ 30` : `${hours} giờ`}</option>)}</select></div>
          <div><label>Giờ dự kiến kết thúc</label><div className="in ro">{endTime}</div></div>
          <div><label htmlFor="bk-people">Số người (tối đa 4)</label><select className="in" id="bk-people" value={people} onChange={(event) => setPeople(Number(event.target.value))}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></div>
          <div className="full hint">
            {!isWalkIn
              ? `Khách tháng: Thời lượng ${duration} giờ sẽ tính ${estimatedTurns} lượt (còn lại ${leftTurns}/${memberInfo?.totalTurns ?? 30} lượt). Không thu tiền mặt.`
              : `Tạm tính: ${people} người × ${duration} giờ × ${money(dashboard.config.courtPrice)} = ${money(cost)}`}
          </div>
          <div className="full"><button className="btn red" style={{ width: '100%' }} type="submit" disabled={submitting}>{submitting ? 'Đang đặt...' : 'Đặt bàn'}</button></div>
        </div>
      </form>
    </>
  );
}

function ClassRequest({ config, onNotify, onRefresh, user }: { config: DashboardResponse['config']; onNotify: (message: string) => void; onRefresh: () => Promise<void>; user: User }) {
  const [date, setDate] = useState(dayKey(new Date()));
  const [start, setStart] = useState(10);
  const [teacher, setTeacher] = useState(user.name || 'Giáo viên');
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (start + 2 > config.classCutoffHour || start < config.openingHour) {
      onNotify(`Lớp chỉ được học trong khoảng ${config.openingHour}:00 – ${config.classCutoffHour}:00.`);
      return;
    }
    setSending(true);
    try {
      await createClassSession({
        teacherId: user.id,
        teacherName: teacher.trim(),
        date,
        startHour: start,
      });
      await onRefresh();
      onNotify('Đăng ký lớp học thành công! Hệ thống đã phân bổ 2 bàn khu dạy học và chuyển quản lý phê duyệt.');
    } catch (err: any) {
      const msg = err?.response?.data?.message || (err instanceof Error ? err.message : 'Không thể đăng ký lớp.');
      onNotify(msg);
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <h3>Đặt bàn lớp học</h3>
      <p className="hint" style={{ marginTop: 4 }}>Giáo viên chỉ đặt ở khu dạy học. Hệ thống tự phân 2 bàn, lớp kéo dài 2 giờ và kết thúc trước {config.classCutoffHour}:00.</p>
      <form noValidate style={{ marginTop: 12 }} onSubmit={submit}>
        <div className="fg">
          <div className="full"><label htmlFor="cl-teacher">Giáo viên phụ trách</label><input className="in" id="cl-teacher" value={teacher} onChange={(event) => setTeacher(event.target.value)} /></div>
          <div><label htmlFor="cl-date">Ngày học</label><input className="in" type="date" id="cl-date" value={date} min={dayKey(new Date())} onChange={(event) => setDate(event.target.value)} /></div>
          <div><label htmlFor="cl-start">Giờ bắt đầu</label><select className="in" id="cl-start" value={start} onChange={(event) => setStart(Number(event.target.value))}>{Array.from({ length: config.classCutoffHour - config.openingHour - 1 }, (_, index) => config.openingHour + index).map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></div>
          <div><label>Giờ kết thúc (tự tính)</label><div className="in ro">{String(start + 2).padStart(2, '0')}:00</div></div>
          <div><label>Trạng thái phê duyệt</label><div className="in ro">Chờ phê duyệt</div></div>
          <div><label>Số tiền dự kiến</label><div className="in ro">Theo cấu hình sân</div></div>
          <div className="full"><button className="btn red" type="submit" style={{ width: '100%' }} disabled={sending}>Đặt bàn lớp học</button></div>
        </div>
      </form>
    </>
  );
}

function MyBookings({ bookings }: { bookings: Booking[] }) {
  return (
    <>
      <h3>Lịch đặt bàn của tôi</h3>
      {bookings.length ? <ul className="res-list" style={{ marginTop: 10 }}>{bookings.slice(0, 12).map((booking) => {
        const status = bookingLabels[booking.status];
        const start = new Date(booking.startTime);
        return <li key={booking.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}><div style={{ minWidth: 0 }}><b>Bàn {booking.tableId}</b> · {dateText(booking.startTime)} {timeText(start)} · {booking.duration} giờ<br /><small className="hint">Mã #{booking.id} · {booking.people} người</small></div><span className={`tag ${status[1]}`}>{status[0]}</span></li>;
      })}</ul> : <p className="hint" style={{ marginTop: 10 }}>Bạn chưa có lượt đặt nào.</p>}
    </>
  );
}

function WaitlistPanel({ bookings }: { bookings: Booking[] }) {
  return (
    <>
      <h3>Danh sách chờ</h3>
      <div className="ovf" style={{ marginTop: 10 }}>
        <table><thead><tr><th>Khách</th><th>SĐT</th><th>Người</th><th>Thời gian</th><th>Tình trạng</th></tr></thead>
          <tbody>{bookings.filter((booking) => booking.status === 'PENDING').map((booking) => <tr key={booking.id}><td>{booking.customerName}</td><td>{booking.phone}</td><td className="num">{booking.people}</td><td className="num">{timeText(new Date(booking.startTime))} · {booking.duration} giờ</td><td><span className="tag t-am">Đang chờ</span></td></tr>)}</tbody>
        </table>
      </div>
      {!bookings.some((booking) => booking.status === 'PENDING') && <p className="hint" style={{ marginTop: 8 }}>Chưa có khách nào đang chờ.</p>}
    </>
  );
}
