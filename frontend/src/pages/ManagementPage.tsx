import { useMemo, useState } from 'react';
import type { DashboardResponse, Member, User } from '../types';
import type { PageId } from '../components/layout/Shell';

const packages = [
  { id: 'p1', name: 'Gói 1 tháng', months: 1, price: 449000 },
  { id: 'p3', name: 'Gói 3 tháng', months: 3, price: 1149000 },
  { id: 'p6', name: 'Gói 6 tháng', months: 6, price: 1999000 },
];
const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')}đ`;
const dateText = (value: string) => new Date(value).toLocaleDateString('vi-VN');

interface ManagementPageProps {
  page: PageId;
  dashboard: DashboardResponse;
  user: User;
  onNotify: (message: string) => void;
  onOpenModal: (title: string, content: string) => void;
}

export function ManagementPage({ page, dashboard, user, onNotify, onOpenModal }: ManagementPageProps) {
  if (page === 'goi') return <PackagesPage config={dashboard.config} />;
  if (page === 'hv') return <MemberHome member={dashboard.members.find((member) => member.id === user.memberId)} config={dashboard.config} />;
  if (page === 'lop') return <ClassesPage dashboard={dashboard} onNotify={onNotify} />;
  if (page === 'khach') return <MembersPage members={dashboard.members} onOpenModal={onOpenModal} />;
  if (page === 'nhansu') return <StaffPage users={dashboard.users} onNotify={onNotify} />;
  if (page === 'hotro') return <SupportPage />;
  if (page === 'doanh') return <StatisticsPage dashboard={dashboard} canSeeForecast={user.role === 'MANAGER'} onNotify={onNotify} />;
  return <SettingsPage dashboard={dashboard} onNotify={onNotify} />;
}

function PackagesPage({ config }: { config: DashboardResponse['config'] }) {
  return (
    <>
      <div className="pg-h"><div><h2>Gói chơi theo tháng</h2><p>Mỗi lượt chơi 2 giờ, 30 lượt cho mỗi kỳ 30 ngày. Đăng ký trực tiếp với nhân viên tại quầy.</p></div></div>
      <div className="packs">{packages.map((item, index) => <article className={`pack ${index === 2 ? 'hot' : ''}`} key={item.id}>
        <h3>{item.name}</h3><div className="pr">{money(item.price)}</div>
        <p className="hint">{item.months * 30} lượt trong {item.months * 30} ngày</p>
        <p>{money(Math.round(item.price / item.months / 30))} mỗi lượt 2 giờ</p>
        {index === 2 && <span className="tag t-rd" style={{ alignSelf: 'flex-start' }}>Tiết kiệm nhất</span>}
      </article>)}</div>
      <section className="card" style={{ marginTop: 16 }}>
        <h3>So với chơi lẻ</h3>
        <p style={{ marginTop: 8 }}>Chơi lẻ tính {money(config.courtPrice)}/người/giờ. Một lượt 2 giờ của một người là {money(config.courtPrice * 2)}, nên 30 lượt tương đương {money(config.courtPrice * 60)}. Khi gia hạn, lượt còn lại được cộng dồn.</p>
      </section>
    </>
  );
}

function MemberHome({ member, config }: { member?: Member; config: DashboardResponse['config'] }) {
  if (!member) return <><div className="pg-h"><div><h2>Góc Hội viên</h2></div></div><section className="card">Tài khoản của bạn chưa có gói đang hoạt động. Liên hệ nhân viên để đăng ký gói 1, 3 hoặc 6 tháng.</section></>;
  const left = Math.max(0, member.totalTurns - member.usedTurns);
  const state = new Date(member.endDate) < new Date() ? ['Hết hạn', 't-gr'] : left <= 5 ? [left ? 'Sắp hết lượt' : 'Hết lượt', left ? 't-am' : 't-rd'] : ['Còn lượt', 't-ok'];
  const selectedPackage = packages.find((item) => item.id === member.packageType);
  return (
    <>
      <div className="pg-h"><div><h2>Góc Hội viên</h2><p>Thông tin gói đang sử dụng của bạn.</p></div><span className={`tag ${state[1]}`} style={{ fontSize: 14 }}>{state[0]}</span></div>
      <div className="two">
        <section className="card">
          <h3>Gói hiện hành: {selectedPackage?.name ?? 'Gói thành viên'}</h3>
          <div className="kpi" style={{ marginTop: 12 }}>
            <div><b>{left} / {member.totalTurns}</b><span>Lượt còn lại / tổng lượt đã đăng ký</span></div>
            <div><b>{money(selectedPackage?.price ?? 0)}</b><span>Giá gói</span></div>
          </div>
          <div className={`bar ${left <= 5 ? 'low' : ''}`} style={{ marginTop: 14 }}><i style={{ width: `${member.totalTurns ? left / member.totalTurns * 100 : 0}%` }} /></div>
          <dl className="det"><dt>Ngày bắt đầu</dt><dd>{dateText(member.startDate)}</dd><dt>Ngày dự kiến kết thúc</dt><dd>{dateText(member.endDate)}</dd></dl>
          <p className="hint" style={{ marginTop: 12 }}>Khi gia hạn, lượt mới được cộng dồn vào lượt đang có. Ví dụ còn 5 lượt, gia hạn gói 1 tháng thì hiển thị 35 lượt.</p>
        </section>
        <section className="card">
          <h3>Thông tin thành viên</h3><p style={{ marginTop: 8 }}><b>{member.name}</b></p>
          <dl className="det"><dt>Số điện thoại</dt><dd>{member.phone}</dd><dt>Email</dt><dd>{member.email}</dd></dl>
        </section>
      </div>
    </>
  );
}

function ClassesPage({ dashboard, onNotify }: { dashboard: DashboardResponse; onNotify: (message: string) => void }) {
  const rows = [...dashboard.classes].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || a.date.localeCompare(b.date) || a.startHour - b.startHour);
  return (
    <>
      <div className="pg-h"><div><h2>Lớp học</h2><p>Duyệt hoặc từ chối lớp do giáo viên đăng ký. Lớp học phải kết thúc trước {dashboard.config.classCutoffHour}:00.</p></div></div>
      <section className="card ovf">
        <table><thead><tr><th>Giáo viên</th><th>Ngày</th><th>Giờ</th><th>Bàn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{rows.map((item) => <tr key={item.id}>
            <td>{item.teacherName}</td><td>{dateText(item.date)}</td><td className="num">{String(item.startHour).padStart(2, '0')}:00 – {String(item.endHour).padStart(2, '0')}:00</td>
            <td>{item.tables.join(', ')}</td><td><span className={`tag ${item.status === 'approved' ? 't-bl' : item.status === 'pending' ? 't-am' : 't-rd'}`}>{item.status === 'approved' ? 'Đã duyệt' : item.status === 'pending' ? 'Chờ phê duyệt' : 'Từ chối'}</span></td>
            <td>{item.status === 'pending' && <><button className="btn sm" type="button" onClick={() => onNotify('API hiện tại chỉ hỗ trợ đọc danh sách lớp; thao tác duyệt chưa được kết nối.')}>Duyệt</button> <button className="btn sm ghost" type="button" onClick={() => onNotify('API hiện tại chưa hỗ trợ từ chối lớp học.')}>Từ chối</button></>}</td>
          </tr>)}</tbody>
        </table>
      </section>
    </>
  );
}

function MembersPage({ members, onOpenModal }: { members: Member[]; onOpenModal: (title: string, content: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(() => members.filter((member) => {
    const left = member.totalTurns - member.usedTurns;
    const status = new Date(member.endDate) < new Date() ? 'het_luot' : left === 0 ? 'het_luot' : left <= 5 ? 'sap_het' : 'con_luot';
    const matchSearch = `${member.name} ${member.phone} ${member.email}`.toLowerCase().includes(query.toLowerCase());
    return matchSearch && (filter === 'all' || filter === status);
  }), [members, query, filter]);
  return (
    <>
      <div className="pg-h"><div><h2>Khách tháng</h2><p>Danh sách khách tháng, gói đã đăng ký và lượt còn lại. Còn 5 lượt trở xuống hệ thống cảnh báo và hiện nút gia hạn.</p></div><button className="btn red" type="button" onClick={() => onOpenModal('Đăng ký gói cho khách', 'Thao tác đăng ký/gia hạn chưa có endpoint trong API hiện tại.')}>Đăng ký gói cho khách</button></div>
      <section className="card">
        <div className="fg" style={{ marginBottom: 12 }}>
          <div><label htmlFor="member-search">Tìm khách</label><input className="in" id="member-search" placeholder="Tên, SĐT hoặc email" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div><label>Trạng thái gói</label><div className="chips">{[['all', 'Tất cả'], ['con_luot', 'Còn lượt'], ['sap_het', 'Sắp hết lượt (≤5)'], ['het_luot', 'Hết lượt']].map(([value, label]) => <button key={value} className="fchip" type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
        </div>
        <div className="ovf"><table><thead><tr><th>Khách</th><th>SĐT / Email</th><th>Gói</th><th>Bắt đầu</th><th>Kết thúc</th><th>Lượt còn lại</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{filtered.map((member) => {
            const left = member.totalTurns - member.usedTurns;
            const pack = packages.find((item) => item.id === member.packageType);
            const statusClass = left <= 5 ? left ? 't-am' : 't-rd' : 't-ok';
            return <tr key={member.id}>
              <td><b>{member.name}</b></td><td>{member.phone}<br /><small className="hint">{member.email}</small></td>
              <td>{pack?.name ?? member.packageType}<br /><small className="hint">{money(pack?.price ?? 0)}</small></td>
              <td className="num">{dateText(member.startDate)}</td><td className="num">{dateText(member.endDate)}</td>
              <td style={{ minWidth: 130 }}><b className="num">{left} / {member.totalTurns}</b><div className={`bar ${left <= 5 ? 'low' : ''}`}><i style={{ width: `${member.totalTurns ? left / member.totalTurns * 100 : 0}%` }} /></div></td>
              <td><span className={`tag ${statusClass}`}>{left === 0 ? 'Hết lượt' : left <= 5 ? 'Sắp hết lượt' : 'Còn lượt'}</span></td>
              <td><button className={`btn sm ${left <= 5 ? 'red' : 'ghost'}`} type="button" onClick={() => onOpenModal(`Gia hạn gói: ${member.name}`, `Hiện còn ${left} / ${member.totalTurns} lượt. Thao tác gia hạn chưa được kết nối với API.`)}>Gia hạn</button></td>
            </tr>;
          })}{!filtered.length && <tr><td colSpan={8}>Không có khách phù hợp.</td></tr>}</tbody>
        </table></div>
        <p className="hint" style={{ marginTop: 10 }}>Gia hạn được cộng dồn vào số lượt đang có theo đặc tả nghiệp vụ.</p>
      </section>
    </>
  );
}

function StaffPage({ users, onNotify }: { users: User[]; onNotify: (message: string) => void }) {
  const staff = users.filter((item) => item.role === 'STAFF');
  return (
    <>
      <div className="pg-h"><div><h2>Tài khoản nhân viên</h2><p>Danh sách tài khoản nhân viên theo dữ liệu API.</p></div><button className="btn red" type="button" onClick={() => onNotify('API hiện tại chưa hỗ trợ tạo tài khoản nhân viên.')}>Thêm nhân viên</button></div>
      <section className="card ovf"><table><thead><tr><th>Nhân viên</th><th>SĐT / Email</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{staff.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.phone}<br /><small className="hint">{item.email}</small></td><td><span className="tag t-ok">Đang hoạt động</span></td><td><button className="btn sm ghost" type="button" onClick={() => onNotify('API hiện tại chưa hỗ trợ quản lý mật khẩu/tài khoản.')}>Quản lý</button></td></tr>)}</tbody>
      </table></section>
    </>
  );
}

function SupportPage() {
  return (
    <>
      <div className="pg-h"><div><h2>Hỗ trợ khách</h2><p>Yêu cầu hỗ trợ và hội thoại khách hàng.</p></div></div>
      <div className="tk-grid"><section className="card"><ul className="res-list"><li>Chưa có yêu cầu hỗ trợ.</li></ul></section><section className="card"><p className="hint">API hiện tại chưa cung cấp dữ liệu ticket hoặc thao tác phản hồi.</p></section></div>
    </>
  );
}

function StatisticsPage({ dashboard, canSeeForecast, onNotify }: { dashboard: DashboardResponse; canSeeForecast: boolean; onNotify: (message: string) => void }) {
  const payments = dashboard.payments;
  const max = Math.max(...payments.map((item) => item.amount), 1);
  return (
    <>
      <div className="pg-h"><div><h2>{canSeeForecast ? 'Thống kê & Dự đoán' : 'Thống kê'}</h2><p>{canSeeForecast ? 'Doanh thu theo dữ liệu thanh toán hiện có và dự báo mật độ theo giờ.' : 'Nhân viên xem nhật ký thanh toán tiền.'}</p></div></div>
      <section className="card"><h3>Doanh thu ghi nhận</h3><div className="kpi" style={{ marginTop: 12 }}><div><b>{money(dashboard.stats.totalRevenue)}</b><span>Tổng doanh thu từ dữ liệu API</span></div><div><b>{payments.length}</b><span>Giao dịch</span></div><div><b>{dashboard.stats.todayBookings}</b><span>Lượt đặt trong dữ liệu</span></div><div><b>{dashboard.stats.activeMembers}</b><span>Khách tháng đang hoạt động</span></div></div></section>
      <section className="card"><h3>Nhật ký thanh toán tiền</h3><div className="ovf" style={{ marginTop: 10 }}><table><thead><tr><th>Giờ</th><th>Khoản thu</th><th>Nhân viên</th><th className="num">Số tiền</th></tr></thead>
        <tbody>{payments.map((payment) => <tr key={payment.id}><td className="num">{new Date(payment.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</td><td>{payment.reference} <span className={`tag ${payment.type === 'goi' ? 't-bl' : 't-ok'}`}>{payment.type === 'goi' ? 'Gói' : 'Tiền chơi'}</span></td><td>{payment.who}</td><td className="num">{money(payment.amount)}</td></tr>)}</tbody>
      </table></div></section>
      <section className="card"><div className="pg-h" style={{ marginBottom: 8 }}><div><h3>{canSeeForecast ? 'Dự báo mật độ theo giờ' : 'Tổng quan sân'}</h3>{canSeeForecast && <p className="hint">Dự báo lịch sử cần dữ liệu occupancy theo tuần; API hiện tại chưa cung cấp dữ liệu này.</p>}</div><div className="legend"><span className="tag t-ok">Thấp</span><span className="tag t-am">Vừa</span><span className="tag t-rd">Cao</span></div></div>
        <div className="abars" role="img" aria-label="Biểu đồ thanh toán"><div className="ab na"><i style={{ height: '8%' }} /></div>{payments.map((payment) => <div className="ab" key={payment.id} title={`${payment.reference}: ${money(payment.amount)}`}><i style={{ height: `${Math.max(4, payment.amount / max * 100)}%`, background: 'var(--btn)' }} /></div>)}</div>
        <div className="chart-l"><span>—</span>{payments.map((payment) => <span key={payment.id}>{payment.type === 'goi' ? 'Gói' : 'Chơi'}</span>)}</div>
        {canSeeForecast && <p className="hint" style={{ marginTop: 8 }}>Hiện có {dashboard.tables.filter((table) => table.status === 'available').length} bàn trống. Dự báo AI-2 chưa thể tính nếu không có dữ liệu lịch sử.</p>}
      </section>
      {!canSeeForecast && <button className="btn ghost" type="button" onClick={() => onNotify('Báo cáo chi tiết chỉ dành cho quản lý.')}>Thông tin quyền truy cập</button>}
    </>
  );
}

function SettingsPage({ dashboard, onNotify }: { dashboard: DashboardResponse; onNotify: (message: string) => void }) {
  const config = dashboard.config;
  const rows: [string, string][] = [
    ['Giá chơi (đ/người/giờ)', money(config.courtPrice)],
    ['Giờ mở cửa', String(config.openingHour)],
    ['Giờ đóng cửa', String(config.closingHour)],
    ['Lớp học kết thúc trước (giờ)', String(config.classCutoffHour)],
    ['Sức chứa tối đa mỗi bàn', String(config.maxPeoplePerTable)],
    ['Thời lượng mặc định', `${config.defaultHours} giờ`],
    ['Nhắc lịch trước', `${config.alertMinutes} phút`],
  ];
  return (
    <>
      <div className="pg-h"><div><h2>Cấu hình</h2><p>Cấu hình hiện tại được đọc từ API. Mọi thay đổi cần endpoint ghi cấu hình.</p></div></div>
      <div className="two">
        <section className="card"><div className="fg">{rows.map(([label, value]) => <div key={label}><label>{label}</label><div className="in ro">{value}</div></div>)}<div className="full"><button className="btn red" type="button" style={{ width: '100%' }} onClick={() => onNotify('API hiện tại chỉ đọc cấu hình; lưu thay đổi chưa được hỗ trợ.')}>Lưu cấu hình</button></div></div></section>
        <section className="card"><h3>Gói khách tháng</h3><ul className="res-list">{packages.map((item) => <li key={item.id}><span>{item.name}</span><b>{money(item.price)}</b></li>)}</ul><p className="hint" style={{ marginTop: 8 }}>Tối đa 30 lượt mỗi kỳ 30 ngày, mỗi lượt 2 giờ. Sức chứa {config.maxPeoplePerTable} người/bàn.</p></section>
      </div>
      <section className="card" style={{ marginTop: 16 }}><h3>Nhật ký thao tác</h3><p className="hint" style={{ marginTop: 8 }}>API hiện tại chưa cung cấp nhật ký thao tác.</p></section>
      <section className="card"><h3>Nhật ký AI</h3><p className="hint" style={{ marginTop: 8 }}>API hiện tại chưa cung cấp nhật ký AI.</p></section>
    </>
  );
}
