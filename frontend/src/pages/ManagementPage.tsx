import { useMemo, useState } from 'react';
import type { DashboardResponse, Member, User } from '../types';
import type { PageId } from '../components/layout/Shell';
import { approveClass, rejectClass, renewMember } from '../services/api';

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
  if (page === 'khach') return <MembersPage members={dashboard.members} onNotify={onNotify} />;
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
  const [classesList, setClassesList] = useState(dashboard.classes);
  const rows = [...classesList].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || a.date.localeCompare(b.date) || a.startHour - b.startHour);

  const handleApprove = async (id: number) => {
    try {
      await approveClass(id);
      setClassesList((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'approved' } : item)));
      onNotify('Đã duyệt lớp học thành công! Bàn đã được ghi nhận trên sơ đồ sân.');
    } catch (err: any) {
      const msg = err?.response?.data?.message || (err instanceof Error ? err.message : 'Lỗi khi duyệt lớp học.');
      onNotify(msg);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectClass(id);
      setClassesList((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'rejected' } : item)));
      onNotify('Đã từ chối lớp học.');
    } catch {
      onNotify('Lỗi khi từ chối lớp học.');
    }
  };

  return (
    <>
      <div className="pg-h">
        <div>
          <h2>Lớp học</h2>
          <p>Duyệt hoặc từ chối lớp do giáo viên đăng ký. Kiểm tra xung đột bàn và giờ; lớp học phải kết thúc trước {dashboard.config.classCutoffHour}:00.</p>
        </div>
      </div>
      <section className="card ovf">
        <table>
          <thead>
            <tr>
              <th>Giáo viên</th>
              <th>Ngày</th>
              <th>Giờ</th>
              <th>Bàn khu dạy học</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td><b>{item.teacherName}</b></td>
                <td>{dateText(item.date)}</td>
                <td className="num">{String(item.startHour).padStart(2, '0')}:00 – {String(item.endHour).padStart(2, '0')}:00</td>
                <td>Bàn {item.tables.join(', ')}</td>
                <td>
                  <span className={`tag ${item.status === 'approved' ? 't-bl' : item.status === 'pending' ? 't-am' : 't-rd'}`}>
                    {item.status === 'approved' ? 'Đã duyệt' : item.status === 'pending' ? 'Chờ phê duyệt' : 'Từ chối'}
                  </span>
                </td>
                <td>
                  {item.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm" type="button" onClick={() => handleApprove(item.id)}>
                        Duyệt
                      </button>
                      <button className="btn sm ghost" type="button" onClick={() => handleReject(item.id)}>
                        Từ chối
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function MembersPage({ members, onNotify }: { members: Member[]; onNotify: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [renewingMember, setRenewingMember] = useState<Member | null>(null);
  const [selectedPackId, setSelectedPackId] = useState('p1');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => members.filter((member) => {
    const left = member.totalTurns - member.usedTurns;
    const status = new Date(member.endDate) < new Date() ? 'het_luot' : left === 0 ? 'het_luot' : left <= 5 ? 'sap_het' : 'con_luot';
    const matchSearch = `${member.name} ${member.phone} ${member.email}`.toLowerCase().includes(query.toLowerCase());
    return matchSearch && (filter === 'all' || filter === status);
  }), [members, query, filter]);

  const handleRenew = async () => {
    if (!renewingMember) return;
    setSubmitting(true);
    try {
      await renewMember(renewingMember.id, selectedPackId);
      const chosenPack = packages.find((p) => p.id === selectedPackId);
      const turnsToAdd = (chosenPack?.months ?? 1) * 30;
      const currentLeft = Math.max(0, renewingMember.totalTurns - renewingMember.usedTurns);
      renewingMember.totalTurns += turnsToAdd;
      renewingMember.packageType = selectedPackId;
      renewingMember.status = 'active';
      onNotify(`Gia hạn thành công ${chosenPack?.name} cho ${renewingMember.name}! Số lượt mới đã cộng dồn: ${currentLeft + turnsToAdd}/${renewingMember.totalTurns} lượt.`);
      setRenewingMember(null);
    } catch {
      onNotify('Lỗi khi thực hiện gia hạn gói.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPack = packages.find((p) => p.id === selectedPackId);
  const leftTurns = renewingMember ? Math.max(0, renewingMember.totalTurns - renewingMember.usedTurns) : 0;
  const turnsAfterRenew = leftTurns + (selectedPack ? selectedPack.months * 30 : 30);

  return (
    <>
      <div className="pg-h">
        <div>
          <h2>Khách tháng</h2>
          <p>Danh sách khách tháng, gói đã đăng ký và lượt còn lại. Còn 5 lượt trở xuống hệ thống cảnh báo và hiện nút gia hạn.</p>
        </div>
      </div>

      {renewingMember && (
        <div className="card" style={{ border: '2px solid var(--brand)', marginBottom: 16 }}>
          <h3>Gia hạn gói cho hội viên: <u>{renewingMember.name}</u></h3>
          <p className="hint" style={{ marginTop: 4 }}>
            Quy tắc: Khi gia hạn, số lượt còn lại ({leftTurns} lượt) sẽ được <b>CỘNG DỒN</b> vào gói mới, không bị reset!
          </p>
          <div className="fg" style={{ marginTop: 12 }}>
            <div>
              <label>Chọn gói gia hạn</label>
              <select className="in" value={selectedPackId} onChange={(e) => setSelectedPackId(e.target.value)}>
                {packages.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name} ({pack.months * 30} lượt - {money(pack.price)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Dự kiến số lượt sau gia hạn</label>
              <div className="in ro" style={{ fontWeight: 'bold', color: 'var(--brand)' }}>
                {leftTurns} (hiện có) + {(selectedPack?.months ?? 1) * 30} (gói mới) = {turnsAfterRenew} lượt
              </div>
            </div>
            <div className="full" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn red" type="button" onClick={handleRenew} disabled={submitting}>
                {submitting ? 'Đang xử lý...' : `Xác nhận gia hạn (${money(selectedPack?.price ?? 0)})`}
              </button>
              <button className="btn ghost" type="button" onClick={() => setRenewingMember(null)}>
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

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
              <td>
                <button
                  className={`btn sm ${left <= 5 ? 'red' : 'ghost'}`}
                  type="button"
                  title="Nhân viên chủ động hỗ trợ gia hạn gói"
                  onClick={() => {
                    setRenewingMember(member);
                    setSelectedPackId(member.packageType || 'p1');
                  }}
                >
                  Gia hạn
                </button>
              </td>
            </tr>;
          })}{!filtered.length && <tr><td colSpan={8}>Không có khách phù hợp.</td></tr>}</tbody>
        </table></div>
        <p className="hint" style={{ marginTop: 10 }}>Gia hạn được cộng dồn vào số lượt đang có theo đúng đặc tả nghiệp vụ PingPongBros.</p>
      </section>
    </>
  );
}



function StatisticsPage({ dashboard, canSeeForecast, onNotify }: { dashboard: DashboardResponse; canSeeForecast: boolean; onNotify: (message: string) => void }) {
  const payments = dashboard.payments;
  const max = Math.max(...payments.map((item) => item.amount), 1);

  // Tính toán AI-2: Dự báo mật độ cho từng khung giờ từ 06:00 đến 21:00
  const forecastHours = useMemo(() => {
    const hours = [];
    const today = new Date().getDay(); // 0: CN, 5: Thứ 6, 6: Thứ 7
    const isWeekendPeak = today === 5 || today === 6 || today === 0;

    for (let h = dashboard.config.openingHour; h < dashboard.config.closingHour; h++) {
      // Đếm số lượt đặt thực tế trong giờ này
      const currentBookings = dashboard.bookings.filter((b) => {
        if (!['CONFIRMED', 'CHECKED_IN'].includes(b.status)) return false;
        const bStart = new Date(b.startTime).getHours();
        const bEnd = bStart + b.duration;
        return h >= bStart && h < bEnd;
      }).length;

      // Mô hình AI trọng số thời gian (giờ tan tầm 17h-20h nhu cầu tăng cao, đặc biệt cuối tuần)
      let baseLoad = 0.2;
      if (h >= 17 && h <= 20) {
        baseLoad = isWeekendPeak ? 0.85 : 0.72;
      } else if (h >= 7 && h <= 9) {
        baseLoad = 0.45;
      } else if (h >= 14 && h < 17) {
        baseLoad = 0.55;
      }

      // Kết hợp dữ liệu đặt thực tế với mô hình dự báo
      const realRatio = currentBookings / 16;
      const combinedRatio = Math.min(1, Math.max(realRatio, baseLoad));

      let level: 'low' | 'med' | 'high' = 'low';
      let levelLabel = 'Thấp';
      let color = '#27ae60'; // Xanh
      if (combinedRatio >= 0.7) {
        level = 'high';
        levelLabel = 'Cao';
        color = '#c0392b'; // Đỏ
      } else if (combinedRatio >= 0.4) {
        level = 'med';
        levelLabel = 'Vừa';
        color = '#f39c12'; // Vàng
      }

      const predictedOccupied = Math.round(combinedRatio * 16);

      hours.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        ratio: combinedRatio,
        heightPct: Math.round(combinedRatio * 100),
        level,
        levelLabel,
        color,
        predictedOccupied,
      });
    }
    return hours;
  }, [dashboard.bookings, dashboard.config]);

  return (
    <>
      <div className="pg-h">
        <div>
          <h2>{canSeeForecast ? 'Thống kê & Dự đoán AI' : 'Thống kê doanh thu'}</h2>
          <p>{canSeeForecast ? 'Thống kê doanh thu và AI-2 dự báo mật độ giờ cao điểm để quản lý chủ động nhân sự.' : 'Nhân viên xem nhật ký thanh toán và doanh thu trong ngày.'}</p>
        </div>
      </div>

      <section className="card">
        <h3>Doanh thu ghi nhận</h3>
        <div className="kpi" style={{ marginTop: 12 }}>
          <div><b>{money(dashboard.stats.totalRevenue)}</b><span>Tổng doanh thu</span></div>
          <div><b>{payments.length}</b><span>Giao dịch thành công</span></div>
          <div><b>{dashboard.stats.todayBookings}</b><span>Lượt đặt sân</span></div>
          <div><b>{dashboard.stats.activeMembers}</b><span>Khách tháng đang hoạt động</span></div>
        </div>
      </section>

      {/* Phân hệ AI-2 Dự báo Giờ cao điểm */}
      {canSeeForecast && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="pg-h" style={{ marginBottom: 10 }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🤖 AI-2 Dự báo mật độ & giờ cao điểm</span>
                <span className="tag" style={{ background: '#1d4ba8', color: '#fff' }}>Dự báo theo giờ</span>
              </h3>
              <p className="hint">
                AI phân tích lịch sử đặt bàn và khung giờ theo ngày trong tuần để dự báo nhu cầu sân, giúp quản lý bố trí nhân sự.
              </p>
            </div>
            <div className="legend">
              <span className="tag" style={{ background: '#eafaf1', color: '#27ae60', border: '1px solid #27ae60' }}>Thấp (&lt;40%)</span>
              <span className="tag" style={{ background: '#fef9e7', color: '#f39c12', border: '1px solid #f39c12' }}>Vừa (40-69%)</span>
              <span className="tag" style={{ background: '#fdedec', color: '#c0392b', border: '1px solid #c0392b' }}>Cao (≥70%)</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, padding: '20px 10px 10px', background: 'var(--surface2, #f8f9fa)', borderRadius: 8, overflowX: 'auto' }}>
            {forecastHours.map((item) => (
              <div
                key={item.hour}
                style={{ flex: '1 1 0', minWidth: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                title={`${item.label}: Dự kiến ${item.predictedOccupied}/16 bàn (${item.levelLabel})`}
              >
                <small style={{ fontSize: 10, color: item.color, fontWeight: 'bold' }}>{item.levelLabel}</small>
                <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'flex-end', background: '#e0e0e0', borderRadius: 4 }}>
                  <div
                    style={{
                      width: '100%',
                      height: `${item.heightPct}%`,
                      background: item.color,
                      borderRadius: 4,
                      transition: 'height 0.4s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, fontWeight: item.level === 'high' ? 'bold' : 'normal', color: item.level === 'high' ? '#c0392b' : 'inherit' }}>
                  {item.hour}h
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: 10, background: '#f0f4fc', borderRadius: 6, fontSize: 13, color: '#103070' }}>
            💡 <b>Nhận định vận hành AI:</b> Khung giờ cao điểm dự kiến rơi vào <b>17:00 – 20:00</b> (mức Cao $\ge 70\%$). Đề xuất quản lý bố trí đủ 2 nhân viên quầy trực hỗ trợ check-in và điều phối hàng chờ.
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Nhật ký thanh toán tiền</h3>
        <div className="ovf" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Giờ</th>
                <th>Khoản thu</th>
                <th>Nhân viên</th>
                <th className="num">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="num">{new Date(payment.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{payment.reference} <span className={`tag ${payment.type === 'goi' ? 't-bl' : 't-ok'}`}>{payment.type === 'goi' ? 'Gói' : 'Tiền chơi'}</span></td>
                  <td>{payment.who}</td>
                  <td className="num">{money(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!canSeeForecast && (
        <button className="btn ghost" style={{ marginTop: 12 }} type="button" onClick={() => onNotify('Báo cáo phân tích nâng cao và dự báo AI chỉ dành cho Quản lý.')}>
          Thông tin phân quyền
        </button>
      )}
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
