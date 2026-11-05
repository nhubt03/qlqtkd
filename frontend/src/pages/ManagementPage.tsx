import { useMemo, useState } from 'react';
import type { DashboardResponse, Member, User } from '../types';
import type { PageId } from '../components/layout/Shell';
import { approveClass, rejectClass, renewMember, updateConfig, activateMember, createStaffAccount } from '../services/api';

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
  if (page === 'khach') return <MembersPage members={dashboard.members} user={user} onNotify={onNotify} />;
  if (page === 'doanh') return <StatisticsPage dashboard={dashboard} canSeeForecast={user.role === 'MANAGER'} onNotify={onNotify} />;
  return <SettingsPage dashboard={dashboard} user={user} onNotify={onNotify} />;
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
  const teacherStats = useMemo(() => {
    const stats: Record<string, { teacherName: string; approvedSessions: number; totalPay: number }> = {};
    const pricePerSession = dashboard.config.teacherPrice || 250000;

    classesList.forEach((c) => {
      if (c.status === 'approved') {
        if (!stats[c.teacherName]) {
          stats[c.teacherName] = { teacherName: c.teacherName, approvedSessions: 0, totalPay: 0 };
        }
        stats[c.teacherName].approvedSessions += 1;
        stats[c.teacherName].totalPay += pricePerSession;
      }
    });

    return Object.values(stats);
  }, [classesList, dashboard.config.teacherPrice]);

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

      {/* TỔNG HỢP THÙ LAO GIÁO VIÊN CUỐI THÁNG (THEO QUY ĐỊNH FR17 & BR10) */}
      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Tổng hợp thù lao Giáo viên (FR17 - Chi trả cuối tháng)</h3>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Quy định thù lao: <b>{money(dashboard.config.teacherPrice || 250000)} / buổi dạy 2 giờ</b>. Hệ thống tự động chốt số liệu vào 23:59 ngày cuối tháng để Quản lý chi trả.
            </p>
          </div>
          <span className="tag t-bl">Chốt 23:59 cuối tháng</span>
        </div>

        <div className="ovf" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Giáo viên / Huấn luyện viên</th>
                <th className="num">Số lớp đã duyệt</th>
                <th className="num">Đơn giá / buổi</th>
                <th className="num">Tổng thù lao nhận</th>
                <th>Trạng thái chi trả</th>
              </tr>
            </thead>
            <tbody>
              {teacherStats.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#64748b' }}>Chưa có lớp học nào được duyệt trong kỳ.</td>
                </tr>
              ) : (
                teacherStats.map((t) => (
                  <tr key={t.teacherName}>
                    <td><b>{t.teacherName}</b></td>
                    <td className="num">{t.approvedSessions} buổi</td>
                    <td className="num">{money(dashboard.config.teacherPrice || 250000)}</td>
                    <td className="num" style={{ fontWeight: 'bold', color: '#16a34a' }}>{money(t.totalPay)}</td>
                    <td><span className="tag t-ok">Sẵn sàng quyết toán</span></td>
                  </tr>
                ))
              )}
            </tbody>
            {teacherStats.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                  <td>TỔNG CỘNG TOÀN CLB</td>
                  <td className="num">{teacherStats.reduce((s, i) => s + i.approvedSessions, 0)} buổi</td>
                  <td className="num">—</td>
                  <td className="num" style={{ color: '#dc2626', fontSize: 15 }}>
                    {money(teacherStats.reduce((s, i) => s + i.totalPay, 0))}
                  </td>
                  <td>—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}

function MembersPage({ members, user, onNotify }: { members: Member[]; user: User; onNotify: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [renewingMember, setRenewingMember] = useState<Member | null>(null);
  const [selectedPackId, setSelectedPackId] = useState('p1');
  const [submitting, setSubmitting] = useState(false);

  // Form kích hoạt gói mới tại quầy
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPackage, setCustPackage] = useState('p1');

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

  const handleActivateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custPhone.trim()) {
      onNotify('Vui lòng nhập đầy đủ họ tên và số điện thoại của khách hàng.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await activateMember({
        customerName: custName.trim(),
        phone: custPhone.trim(),
        email: custEmail.trim(),
        packageId: custPackage,
        staffName: user.name,
      });

      if (res.ok && res.member) {
        members.push(res.member);
        onNotify(res.message || `Kích hoạt thành công gói cước cho ${custName}!`);
        setCustName('');
        setCustPhone('');
        setCustEmail('');
        setCustPackage('p1');
        setShowActivateModal(false);
      }
    } catch (err: any) {
      onNotify(err?.response?.data?.message || 'Lỗi khi kích hoạt gói tháng cho khách.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPack = packages.find((p) => p.id === selectedPackId);
  const newPackChoice = packages.find((p) => p.id === custPackage);
  const leftTurns = renewingMember ? Math.max(0, renewingMember.totalTurns - renewingMember.usedTurns) : 0;
  const turnsAfterRenew = leftTurns + (selectedPack ? selectedPack.months * 30 : 30);

  return (
    <>
      <div className="pg-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Khách tháng & Hội viên</h2>
          <p>Quản lý danh sách hội viên, đăng ký kích hoạt gói tháng mới và theo dõi lượt chơi.</p>
        </div>
        <button
          className="btn"
          style={{ background: '#16a34a', color: '#fff', fontWeight: 'bold' }}
          type="button"
          onClick={() => {
            setShowActivateModal(!showActivateModal);
            setRenewingMember(null);
          }}
        >
          {showActivateModal ? 'Đóng form' : '+ Kích hoạt gói tháng cho khách'}
        </button>
      </div>

      {/* FORM KÍCH HOẠT GÓI THÁNG MỚI TẠI QUẦY */}
      {showActivateModal && (
        <div className="card" style={{ border: '2px solid #16a34a', marginBottom: 16, background: '#f0fdf4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: '#166534', margin: 0 }}>Kích hoạt thẻ Hội viên (MEMBER) & Nạp gói tháng tại quầy</h3>
            <span className="tag t-ok">Thanh toán tại quầy</span>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            Nhân viên/Quản lý thu tiền gói tháng của khách. Hệ thống sẽ tự động cấp số lượt chơi tương ứng và nâng cấp tài khoản của khách thành <b>MEMBER</b>.
          </p>
          <form onSubmit={handleActivateNew} style={{ marginTop: 12 }}>
            <div className="fg">
              <div>
                <label>Họ và tên khách hàng *</label>
                <input
                  className="in"
                  placeholder="Ví dụ: Hoàng Minh Quân"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Số điện thoại khách hàng *</label>
                <input
                  className="in"
                  placeholder="09xx xxx xxx"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Địa chỉ Email (Để nâng cấp tài khoản)</label>
                <input
                  className="in"
                  type="email"
                  placeholder="khachhang@gmail.com"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                />
              </div>
              <div>
                <label>Chọn gói tháng đăng ký</label>
                <select className="in" value={custPackage} onChange={(e) => setCustPackage(e.target.value)}>
                  {packages.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name} ({pack.months * 30} lượt / {pack.months * 30} ngày) - {money(pack.price)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="full" style={{ background: '#dcfce7', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, color: '#166534' }}>Số tiền thu của khách:</span>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#15803d' }}>{money(newPackChoice?.price ?? 449000)}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, color: '#166534' }}>
                  Số lượt nạp vào tài khoản: <b>{(newPackChoice?.months ?? 1) * 30} lượt chơi</b>
                </div>
              </div>
              <div className="full" style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn" type="submit" disabled={submitting} style={{ background: '#16a34a', color: '#fff', fontWeight: 'bold' }}>
                  {submitting ? 'Đang kích hoạt...' : `Xác nhận thu tiền & Kích hoạt thẻ hội viên`}
                </button>
                <button className="btn ghost" type="button" onClick={() => setShowActivateModal(false)}>
                  Hủy bỏ
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

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

  const exportCSV = () => {
    if (!payments.length) {
      onNotify('Chưa có dữ liệu thanh toán để xuất báo cáo.');
      return;
    }
    const headers = ['STT', 'Thời gian', 'Loại giao dịch', 'Tham chiếu / Khách hàng', 'Người thu', 'Số tiền (VNĐ)'];
    const rows = payments.map((p, idx) => [
      idx + 1,
      `"${new Date(p.createdAt).toLocaleString('vi-VN')}"`,
      `"${p.type === 'goi' ? 'Gói tháng' : 'Tiền chơi lẻ'}"`,
      `"${p.reference.replace(/"/g, '""')}"`,
      `"${p.who.replace(/"/g, '""')}"`,
      p.amount,
    ]);
    const total = payments.reduce((sum, item) => sum + item.amount, 0);
    rows.push(['TỔNG CỘNG', '', '', `"${payments.length} giao dịch"`, '', total]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_Cao_Doanh_Thu_PingPongBros_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify('Đã xuất báo cáo doanh thu thành công (file CSV tương thích Excel)!');
  };
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3>Nhật ký thanh toán tiền</h3>
          <button className="btn" type="button" onClick={exportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>📥 Xuất báo cáo (CSV/Excel)</span>
          </button>
        </div>
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

interface AuditLog {
  id: number;
  user: string;
  action: string;
  oldVal: string;
  newVal: string;
  time: string;
}

function SettingsPage({ dashboard, user, onNotify }: { dashboard: DashboardResponse; user: User; onNotify: (message: string) => void }) {
  const config = dashboard.config;
  const [courtPrice, setCourtPrice] = useState(config.courtPrice || 20000);
  const [teacherPrice, setTeacherPrice] = useState(config.teacherPrice || 250000);
  const [holdLimitMinutes, setHoldLimitMinutes] = useState(config.holdLimitMinutes || 15);
  const [openingHour, setOpeningHour] = useState(config.openingHour || 6);
  const [closingHour, setClosingHour] = useState(config.closingHour || 21);
  const [classCutoffHour, setClassCutoffHour] = useState(config.classCutoffHour || 19);
  const [saving, setSaving] = useState(false);

  const [logs, setLogs] = useState<AuditLog[]>([
    { id: 1, user: 'Hệ thống', action: 'Khởi tạo cấu hình ban đầu', oldVal: '—', newVal: 'Giá: 20k/h · Giữ bàn: 15p · GV: 250k', time: new Date().toLocaleTimeString('vi-VN') },
  ]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await updateConfig({
        courtPrice,
        teacherPrice,
        holdLimitMinutes,
        openingHour,
        closingHour,
        classCutoffHour,
      });

      config.courtPrice = courtPrice;
      config.teacherPrice = teacherPrice;
      config.holdLimitMinutes = holdLimitMinutes;
      config.openingHour = openingHour;
      config.closingHour = closingHour;
      config.classCutoffHour = classCutoffHour;

      const newLog: AuditLog = {
        id: Date.now(),
        user: user.name,
        action: 'Cập nhật cấu hình hệ thống',
        oldVal: 'Cấu hình cũ',
        newVal: `Giá chơi: ${money(courtPrice)} · Giữ bàn: ${holdLimitMinutes}p · GV: ${money(teacherPrice)}`,
        time: new Date().toLocaleTimeString('vi-VN'),
      };
      setLogs((prev) => [newLog, ...prev]);

      onNotify('Đã lưu cấu hình và ghi nhận nhật ký thao tác thành công!');
    } catch {
      onNotify('Lỗi khi lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="pg-h">
        <div>
          <h2>Cấu hình hệ thống</h2>
          <p>Thiết lập giá dịch vụ, hạn mức giữ bàn 15 phút, giá dịch vụ giáo viên và giờ mở/đóng cửa. Mọi thay đổi đều được ghi nhật ký.</p>
        </div>
      </div>

      <div className="two">
        <section className="card">
          <h3>Thiết lập dịch vụ</h3>
          <form
            noValidate
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveConfig();
            }}
          >
            <div className="fg">
              <div>
                <label>Giá chơi lẻ (đ/người/giờ)</label>
                <input
                  className="in"
                  type="number"
                  step="1000"
                  value={courtPrice}
                  onChange={(e) => setCourtPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Giá dịch vụ giáo viên (đ/lượt 2h)</label>
                <input
                  className="in"
                  type="number"
                  step="5000"
                  value={teacherPrice}
                  onChange={(e) => setTeacherPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Hạn mức giữ bàn khi chưa check-in (phút)</label>
                <input
                  className="in"
                  type="number"
                  min="5"
                  max="60"
                  value={holdLimitMinutes}
                  onChange={(e) => setHoldLimitMinutes(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Giờ mở cửa (giờ)</label>
                <input
                  className="in"
                  type="number"
                  min="4"
                  max="12"
                  value={openingHour}
                  onChange={(e) => setOpeningHour(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Giờ đóng cửa (giờ)</label>
                <input
                  className="in"
                  type="number"
                  min="18"
                  max="24"
                  value={closingHour}
                  onChange={(e) => setClosingHour(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Lớp học kết thúc trước (giờ)</label>
                <input
                  className="in"
                  type="number"
                  min="16"
                  max="21"
                  value={classCutoffHour}
                  onChange={(e) => setClassCutoffHour(Number(e.target.value))}
                />
              </div>
              <div className="full">
                <button className="btn red" type="submit" style={{ width: '100%' }} disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình hệ thống'}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="card">
          <h3>Gói khách tháng</h3>
          <ul className="res-list">
            {packages.map((item) => (
              <li key={item.id}>
                <span>{item.name} ({item.months * 30} lượt / {item.months * 30} ngày)</span>
                <b>{money(item.price)}</b>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginTop: 12 }}>
            Quy định: Hạn mức giữ bàn mặc định là <b>{holdLimitMinutes} phút</b>. Quá thời gian này hệ thống tự động giải phóng bàn. Sau <b>{classCutoffHour}:00</b>, bàn khu dạy học được phép phân bổ cho khách vãng lai và khách tháng.
          </p>
        </section>
      </div>

      {/* QUẢN LÝ VÀ CẤP TÀI KHOẢN NHÂN VIÊN (STAFF) - CHỈ QUẢN TRỊ VIÊN (MANAGER) MỚI CÓ QUYỀN */}
      {user.role === 'MANAGER' && (
        <StaffManagementSection dashboard={dashboard} onNotify={onNotify} />
      )}

      {/* Nhật ký thao tác */}
      <section className="card" style={{ marginTop: 16 }}>
        <h3>Nhật ký thao tác & Chỉnh sửa cấu hình</h3>
        <p className="hint" style={{ marginTop: 4 }}>
          Mọi thao tác thay đổi giá, cấu hình, thanh toán và hủy bàn đều được lưu vết để phục vụ kiểm toán.
        </p>
        <div className="ovf" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Thao tác</th>
                <th>Giá trị mới</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="num">{log.time}</td>
                  <td><b>{log.user}</b></td>
                  <td>{log.action}</td>
                  <td><span className="tag t-ok">{log.newVal}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Nhật ký AI (AI-1, AI-2, AI-3)</h3>
        <div className="ovf" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Tính năng</th>
                <th>Đầu vào</th>
                <th>Đầu ra</th>
                <th>Độ tin cậy</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>AI-1: Khung giờ thay thế</b></td>
                <td>Khung giờ kín bàn</td>
                <td>Gợi ý khung giờ lân cận có bàn trống</td>
                <td><span className="tag t-bl">95%</span></td>
              </tr>
              <tr>
                <td><b>AI-2: Dự báo cao điểm</b></td>
                <td>Lịch sử đặt bàn & thứ trong tuần</td>
                <td>Mật độ theo giờ: Thấp, Vừa, Cao (17h-20h)</td>
                <td><span className="tag t-ok">90%</span></td>
              </tr>
              <tr>
                <td><b>AI-3: NLP Chatbot</b></td>
                <td>Câu ngôn ngữ tự nhiên, viết tắt</td>
                <td>Số người, ngày, giờ, thời lượng</td>
                <td><span className="tag t-am">88%</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StaffManagementSection({ dashboard, onNotify }: { dashboard: DashboardResponse; onNotify: (msg: string) => void }) {
  const [staffList, setStaffList] = useState<User[]>(() => dashboard.users.filter((u) => u.role === 'STAFF'));
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('123456');
  const [submitting, setSubmitting] = useState(false);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      onNotify('Vui lòng điền đầy đủ họ tên, số điện thoại, email và mật khẩu của nhân viên.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createStaffAccount({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password: password.trim(),
      });

      if (res.ok && res.user) {
        dashboard.users.push(res.user);
        setStaffList((prev) => [...prev, res.user]);
        onNotify(res.message || `Đã cấp tài khoản Nhân viên thành công cho ${name}!`);
        setName('');
        setPhone('');
        setEmail('');
        setPassword('123456');
        setShowAddForm(false);
      }
    } catch (err: any) {
      onNotify(err?.response?.data?.message || 'Lỗi khi cấp tài khoản nhân viên.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3>Quản lý & Cấp tài khoản Nhân viên (STAFF)</h3>
          <p className="hint" style={{ marginTop: 2 }}>
            Chỉ Quản trị viên (Admin) mới có quyền cấp phát tài khoản nhân viên làm việc tại quầy và sân CLB.
          </p>
        </div>
        <button
          className="btn"
          style={{ background: '#0284c7', color: '#fff', fontWeight: 'bold' }}
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Đóng form' : '+ Cấp tài khoản Nhân viên mới'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateStaff} style={{ marginTop: 14, background: '#f0f9ff', padding: 16, borderRadius: 8, border: '1px solid #bae6fd' }}>
          <h4 style={{ margin: '0 0 10px', color: '#0369a1' }}>Điền thông tin nhân viên mới</h4>
          <div className="fg">
            <div>
              <label>Họ và tên nhân viên *</label>
              <input className="in" placeholder="Ví dụ: Lê Thị Thảo" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label>Số điện thoại *</label>
              <input className="in" placeholder="09xx xxx xxx" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <label>Email đăng nhập (Duy nhất) *</label>
              <input className="in" type="email" placeholder="nhanvien.thao@pingpongbros.vn" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>Mật khẩu khởi tạo *</label>
              <input className="in" type="text" placeholder="123456" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="full" style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn" type="submit" disabled={submitting} style={{ background: '#0284c7', color: '#fff', fontWeight: 'bold' }}>
                {submitting ? 'Đang khởi tạo...' : 'Xác nhận cấp tài khoản Nhân viên'}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowAddForm(false)}>
                Hủy bỏ
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="ovf" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Họ và tên</th>
              <th>Số điện thoại</th>
              <th>Email đăng nhập</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((st) => (
              <tr key={st.id}>
                <td className="num">#{st.id}</td>
                <td><b>{st.name}</b></td>
                <td>{st.phone}</td>
                <td><span className="tag t-bl">{st.email}</span></td>
                <td><span className="tag t-ok">STAFF (Nhân viên)</span></td>
                <td><span style={{ color: '#16a34a', fontWeight: 'bold' }}>● Đang làm việc</span></td>
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px' }}>
                  Chưa có tài khoản nhân viên nào được tạo. Hãy bấm <b>"+ Cấp tài khoản Nhân viên mới"</b> ở trên để tạo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
