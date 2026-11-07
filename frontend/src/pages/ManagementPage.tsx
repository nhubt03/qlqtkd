import { useEffect, useMemo, useState } from 'react';
import type { AuditLog, DashboardResponse, Member, TransferredConversation, User } from '../types';
import type { PageId } from '../components/layout/Shell';
import {
  approveClass,
  rejectClass,
  renewMember,
  updateConfig,
  activateMember,
  createStaffAccount,
  checkInClass,
  checkOutClass,
  createMemberAccount,
  fetchTransferredConversations,
  replyTransferredConversation,
  resolveTransferredConversation,
  escalateConversationToManager,
  sweepExpiredMembers,
  fetchAuditLogs,
} from '../services/api';

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
  if (page === 'lop') return <ClassesPage dashboard={dashboard} user={user} onNotify={onNotify} />;
  if (page === 'khach') return <MembersPage members={dashboard.members} user={user} onNotify={onNotify} />;
  if (page === 'doanh') return <StatisticsPage dashboard={dashboard} user={user} onNotify={onNotify} />;
  if (user.role === 'TEACHER') {
    return <ClassesPage dashboard={dashboard} user={user} onNotify={onNotify} />;
  }
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

function ClassesPage({ dashboard, user, onNotify }: { dashboard: DashboardResponse; user: User; onNotify: (message: string) => void }) {
  const [classesList, setClassesList] = useState(dashboard.classes);
  const isTeacher = user.role === 'TEACHER';
  
  const teacherClasses = isTeacher
    ? classesList.filter((c) => c.teacherName === user.name || (user.id && (c as any).teacherId === user.id) || !c.teacherName)
    : classesList;

  const approvedCount = teacherClasses.filter((c) => c.status === 'approved').length;
  const pendingCount = teacherClasses.filter((c) => c.status === 'pending').length;
  const rejectedCount = teacherClasses.filter((c) => c.status === 'rejected').length;

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

  const [rejectingClassId, setRejectingClassId] = useState<number | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('Lịch sân không phù hợp hoặc trùng lịch');

  const rows = [...teacherClasses].sort(
    (a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || a.date.localeCompare(b.date) || a.startHour - b.startHour
  );

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

  const openRejectModal = (id: number) => {
    setRejectingClassId(id);
    setRejectReasonInput('Lịch sân không phù hợp hoặc trùng lịch');
  };

  const handleConfirmReject = async () => {
    if (!rejectingClassId) return;
    try {
      const reason = rejectReasonInput.trim() || 'Lịch sân không phù hợp';
      await rejectClass(rejectingClassId, reason);
      setClassesList((prev) =>
        prev.map((item) => (item.id === rejectingClassId ? { ...item, status: 'rejected', rejectReason: reason } : item))
      );
      setRejectingClassId(null);
      onNotify(`Đã từ chối lớp học. Lý do: "${reason}".`);
    } catch {
      onNotify('Lỗi khi từ chối lớp học.');
    }
  };

  const handleClassCheckIn = async (id: number) => {
    try {
      const res = await checkInClass(id);
      setClassesList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, checkedInAt: new Date().toISOString() } : item))
      );
      onNotify(res.message || 'Check-in lớp học thành công! Bàn đã chuyển sang trạng thái đang học.');
    } catch (err: any) {
      onNotify(err?.response?.data?.message || 'Lỗi khi check-in lớp học.');
    }
  };

  const handleClassCheckOut = async (id: number) => {
    try {
      const res = await checkOutClass(id);
      setClassesList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, checkedOutAt: new Date().toISOString() } : item))
      );
      onNotify(res.message || 'Check-out lớp học thành công! Bàn đã được giải phóng.');
    } catch (err: any) {
      onNotify(err?.response?.data?.message || 'Lỗi khi check-out lớp học.');
    }
  };

  return (
    <>
      <div className="pg-h">
        <div>
          <h2>{isTeacher ? 'Lớp dạy của tôi' : 'Lớp học'}</h2>
          <p>
            {isTeacher
              ? 'Theo dõi trạng thái các yêu cầu đăng ký lớp học (Chờ duyệt, Đã duyệt, Từ chối kèm lý do) và thông báo từ Quản lý.'
              : `Duyệt hoặc từ chối lớp do giáo viên đăng ký. Kiểm tra xung đột bàn và giờ; lớp học phải kết thúc trước ${dashboard.config.classCutoffHour}:00.`}
          </p>
        </div>
      </div>

      {isTeacher && (
        <div style={{ marginBottom: 16 }}>
          {approvedCount > 0 && (
            <div className="alert ok" style={{ marginBottom: 8 }}>
              <span>🔔 <b>Thông báo lớp học:</b> Bạn có <b>{approvedCount}</b> lớp học đã được Quản lý duyệt thành công!</span>
            </div>
          )}
          {rejectedCount > 0 && (
            <div className="alert danger" style={{ marginBottom: 8 }}>
              <span>❌ <b>Thông báo từ chối:</b> Bạn có <b>{rejectedCount}</b> yêu cầu lớp học bị từ chối. Vui lòng xem lý do chi tiết trong bảng bên dưới.</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="alert info" style={{ marginBottom: 8 }}>
              <span>⏳ <b>Thông báo:</b> Bạn có <b>{pendingCount}</b> yêu cầu lớp học đang ở trạng thái <b>"Chờ duyệt"</b> từ ban quản lý.</span>
            </div>
          )}
        </div>
      )}

      <section className="card ovf">
        <table>
          <thead>
            <tr>
              {!isTeacher && <th>Giáo viên</th>}
              <th>Ngày</th>
              <th>Giờ</th>
              <th>Bàn khu dạy học</th>
              <th>Trạng thái</th>
              <th>{isTeacher ? 'Lý do / Phản hồi' : 'Thao tác'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isTeacher ? 5 : 6} style={{ textAlign: 'center', color: '#64748b', padding: '24px 0' }}>
                  {isTeacher ? 'Bạn chưa có yêu cầu lớp học nào. Hãy vào mục "Sân" để đăng ký lớp dạy mới.' : 'Chưa có yêu cầu lớp học nào.'}
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.id}>
                  {!isTeacher && <td><b>{item.teacherName}</b></td>}
                  <td>{dateText(item.date)}</td>
                  <td className="num">{String(item.startHour).padStart(2, '0')}:00 – {String(item.endHour).padStart(2, '0')}:00</td>
                  <td>Bàn {item.tables.join(', ')}</td>
                  <td>
                    <span className={`tag ${item.status === 'approved' ? 't-ok' : item.status === 'pending' ? 't-am' : 't-rd'}`}>
                      {item.status === 'approved' ? 'Đã duyệt' : item.status === 'pending' ? 'Chờ duyệt' : 'Từ chối'}
                    </span>
                  </td>
                  <td>
                    {isTeacher ? (
                      item.status === 'rejected' ? (
                        <span style={{ color: '#dc2626', fontSize: 13 }}>
                          <b>Lý do:</b> {item.rejectReason || 'Lịch sân không phù hợp hoặc trùng lịch khác.'}
                        </span>
                      ) : item.status === 'approved' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ color: '#16a34a', fontSize: 13, marginRight: 4 }}>
                            ✓ Bàn {item.tables.join(', ')}
                          </span>
                          {!item.checkedInAt ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn sm" type="button" onClick={() => handleClassCheckIn(item.id)}>
                                Check-in lớp
                              </button>
                              <button
                                className="btn sm ghost"
                                type="button"
                                style={{ color: '#dc2626', borderColor: '#dc2626' }}
                                onClick={() => handleClassCheckOut(item.id)}
                              >
                                Check-out kết thúc
                              </button>
                            </div>
                          ) : !item.checkedOutAt ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="tag t-ok" style={{ fontSize: 11 }}>Đang dạy</span>
                              <button
                                className="btn sm"
                                style={{ background: '#dc2626', color: '#fff', fontWeight: 'bold' }}
                                type="button"
                                onClick={() => handleClassCheckOut(item.id)}
                              >
                                Check-out lớp
                              </button>
                            </div>
                          ) : (
                            <span className="tag t-gr" style={{ fontSize: 11 }}>✓ Đã check-out hoàn tất</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#d97706', fontSize: 13 }}>
                          ⏳ Đang chờ quản lý phê duyệt
                        </span>
                      )
                    ) : (
                      item.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn sm" type="button" onClick={() => handleApprove(item.id)}>
                            Duyệt
                          </button>
                          <button className="btn sm ghost" type="button" onClick={() => openRejectModal(item.id)}>
                            Từ chối
                          </button>
                        </div>
                      ) : item.status === 'approved' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {!item.checkedInAt ? (
                            <button className="btn sm" type="button" onClick={() => handleClassCheckIn(item.id)}>
                              Check-in lớp
                            </button>
                          ) : !item.checkedOutAt ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="tag t-ok" style={{ fontSize: 11 }}>Đang học</span>
                              <button className="btn sm ghost" type="button" onClick={() => handleClassCheckOut(item.id)}>
                                Check-out lớp
                              </button>
                            </div>
                          ) : (
                            <span className="tag t-gr" style={{ fontSize: 11 }}>Đã hoàn tất</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#dc2626' }}>
                          Lý do: {item.rejectReason || 'Không chấp thuận'}
                        </span>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* MODAL NHẬP LÝ DO TỪ CHỐI LỚP HỌC CHO QUẢN LÝ */}
      {rejectingClassId !== null && (
        <div className="mask" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 440, maxWidth: '90%', padding: 24, borderRadius: 12, background: '#fff' }}>
            <h3 style={{ marginTop: 0, color: '#b91c1c' }}>Từ chối yêu cầu lớp học</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Vui lòng nhập lý do từ chối để hệ thống gửi thông báo phản hồi chi tiết cho giáo viên.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Lý do thường gặp:</label>
              <select
                className="in"
                style={{ width: '100%', marginBottom: 8 }}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
              >
                <option value="Lịch sân không phù hợp hoặc trùng lịch">Lịch sân không phù hợp hoặc trùng lịch</option>
                <option value="Trùng lịch tổ chức giải đấu nội bộ">Trùng lịch tổ chức giải đấu nội bộ</option>
                <option value="Khu dạy học đang tiến hành bảo trì bàn">Khu dạy học đang tiến hành bảo trì bàn</option>
                <option value="Vượt quá khung giờ quy định trước 19h">Vượt quá khung giờ quy định trước 19h</option>
                <option value="Khác (nhập chi tiết bên dưới)">Khác (nhập chi tiết bên dưới)</option>
              </select>
              <textarea
                className="in"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="Nhập chi tiết lý do từ chối gửi cho giáo viên..."
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn ghost" type="button" onClick={() => setRejectingClassId(null)}>Hủy bỏ</button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }} type="button" onClick={handleConfirmReject}>
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

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
          <p>Quản lý danh sách hội viên, tạo tài khoản khách tháng (mật khẩu mã hóa mặc định 123456) và theo dõi lượt chơi.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn ghost sm"
            type="button"
            title="Quét và chuyển trạng thái các gói cước đã hết hạn (Mục 8)"
            onClick={async () => {
              try {
                const res = await sweepExpiredMembers();
                onNotify(res.message || 'Đã quét và cập nhật trạng thái hội viên hết hạn.');
              } catch {
                onNotify('Không thể quét hội viên hết hạn.');
              }
            }}
          >
            🔄 Quét gói hết hạn
          </button>
          <button
            className="btn"
            style={{ background: '#16a34a', color: '#fff', fontWeight: 'bold' }}
            type="button"
            onClick={() => {
              setShowActivateModal(!showActivateModal);
              setRenewingMember(null);
            }}
          >
            {showActivateModal ? 'Đóng form' : '+ Tạo tài khoản / Kích hoạt gói tháng'}
          </button>
        </div>
      </div>

      {/* FORM KÍCH HOẠT GÓI THÁNG MỚI TẠI QUẦY (MỤC 4 & MỤC 7) */}
      {showActivateModal && (
        <div className="card" style={{ border: '2px solid #16a34a', marginBottom: 16, background: '#f0fdf4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: '#166534', margin: 0 }}>Tạo tài khoản Khách tháng & Kích hoạt gói tại quầy (Mục 4 & Mục 7)</h3>
            <span className="tag t-ok">Thanh toán tại quầy</span>
          </div>
          <div style={{ marginTop: 8, padding: '8px 12px', background: '#dcfce7', borderRadius: 6, fontSize: 13, color: '#14532d', lineHeight: 1.5 }}>
            <b>🛡️ Quy định bảo mật tài khoản (Mục 4, 6 & 7):</b><br />
            • Mật khẩu mặc định được gán là <b>123456</b> và <b>bắt buộc được mã hóa Scrypt</b> trước khi lưu vào CSDL (không lưu dạng văn bản thuần).<br />
            • Kích hoạt trạng thái <b>bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên</b>.<br />
            • Nếu khách hàng đã từng có tài khoản khách vãng lai, hệ thống <b>tự động chuyển đổi loại tài khoản sang khách tháng và bảo toàn 100% dữ liệu lịch sử</b> đặt bàn, giao dịch (không tạo tài khoản trùng).
          </div>
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



function StatisticsPage({ dashboard, user, onNotify }: { dashboard: DashboardResponse; user: User; onNotify: (message: string) => void }) {
  const isManager = user.role === 'MANAGER';
  const isStaff = user.role === 'STAFF';
  const payments = dashboard.payments;

  const [activeTab, setActiveTab] = useState<'revenue' | 'transfers' | 'audit'>('revenue');

  // Doanh thu: Nhân viên chỉ được xem hôm nay ('today'). Quản lý được xem tất cả.
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'week' | 'month'>(isStaff ? 'today' : 'all');

  // Hội thoại chuyển tiếp từ Chatbot
  const [conversations, setConversations] = useState<TransferredConversation[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [selectedConv, setSelectedConv] = useState<TransferredConversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Nhật ký kiểm toán hệ thống (Manager)
  const [systemLogs, setSystemLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');

  // Tải danh sách hội thoại chuyển tiếp
  const loadConversations = async () => {
    setLoadingConv(true);
    try {
      const res = await fetchTransferredConversations(user.role);
      if (res && res.conversations) {
        setConversations(res.conversations);
        if (selectedConv) {
          const updated = res.conversations.find((c: TransferredConversation) => c.id === selectedConv.id);
          if (updated) setSelectedConv(updated);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingConv(false);
    }
  };

  // Tải nhật ký hệ thống
  const loadAuditLogs = async () => {
    if (!isManager) return;
    setLoadingLogs(true);
    try {
      const res = await fetchAuditLogs(user.role);
      if (res && res.logs) {
        setSystemLogs(res.logs);
      }
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'transfers') {
      loadConversations();
      const interval = setInterval(loadConversations, 5000);
      return () => clearInterval(interval);
    }
    if (activeTab === 'audit' && isManager) {
      loadAuditLogs();
    }
  }, [activeTab, isManager]);

  const handleSendReply = async () => {
    if (!selectedConv || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await replyTransferredConversation(selectedConv.id, replyText.trim(), user.name, user.role);
      if (res && res.conversation) {
        setSelectedConv(res.conversation);
        setConversations((prev) => prev.map((c) => (c.id === res.conversation.id ? res.conversation : c)));
      }
      setReplyText('');
      onNotify('Đã gửi phản hồi đến khách hàng.');
    } catch {
      onNotify('Lỗi khi gửi phản hồi.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleResolve = async (convId: string) => {
    try {
      const res = await resolveTransferredConversation(convId);
      if (res && res.conversation) {
        setSelectedConv(res.conversation);
        setConversations((prev) => prev.map((c) => (c.id === res.conversation.id ? res.conversation : c)));
      }
      onNotify('Đã đánh dấu hoàn tất cuộc hội thoại.');
    } catch {
      onNotify('Lỗi khi hoàn tất cuộc hội thoại.');
    }
  };

  const handleEscalateToManager = async (convId: string) => {
    try {
      const res = await escalateConversationToManager(convId, user.email);
      if (res && res.conversation) {
        setSelectedConv(res.conversation);
        setConversations((prev) => prev.map((c) => (c.id === res.conversation.id ? res.conversation : c)));
      }
      onNotify('Đã chuyển tiếp cuộc hội thoại qua cho Quản lý xử lý thành công.');
    } catch {
      onNotify('Lỗi khi chuyển tiếp qua Quản lý.');
    }
  };

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Tính doanh thu hôm nay
  const todayRevenue = useMemo(() => {
    return payments
      .filter((p) => p.createdAt && p.createdAt.slice(0, 10) === todayStr)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments, todayStr]);

  // Tính doanh thu tuần này (tính từ thứ Hai đầu tuần)
  const dayOfWeek = (now.getDay() + 6) % 7; // Thứ 2 = 0, CN = 6
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);

  const weekRevenue = useMemo(() => {
    return payments
      .filter((p) => new Date(p.createdAt) >= startOfWeek)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments, startOfWeek]);

  // Tính doanh thu tháng này
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthRevenue = useMemo(() => {
    return payments
      .filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments, currentMonth, currentYear]);

  // Lọc danh sách thanh toán theo kỳ đã chọn (Nhân viên bị khóa ở 'today')
  const effectivePeriod = isStaff ? 'today' : periodFilter;

  const filteredPayments = useMemo(() => {
    if (effectivePeriod === 'today') {
      return payments.filter((p) => p.createdAt && p.createdAt.slice(0, 10) === todayStr);
    }
    if (effectivePeriod === 'week') {
      return payments.filter((p) => new Date(p.createdAt) >= startOfWeek);
    }
    if (effectivePeriod === 'month') {
      return payments.filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
    }
    return payments;
  }, [payments, effectivePeriod, todayStr, startOfWeek, currentMonth, currentYear]);

  const exportCSV = () => {
    if (isStaff) {
      onNotify('Lỗi 403: Nhân viên không được phép xuất báo cáo doanh thu. Quyền hạn thuộc về Quản lý.');
      return;
    }
    if (!filteredPayments.length) {
      onNotify('Chưa có dữ liệu thanh toán để xuất báo cáo.');
      return;
    }
    const headers = ['STT', 'Thời gian', 'Loại giao dịch', 'Tham chiếu / Khách hàng', 'Người thu', 'Số tiền (VNĐ)'];
    const rows = filteredPayments.map((p, idx) => [
      idx + 1,
      `"${new Date(p.createdAt).toLocaleString('vi-VN')}"`,
      `"${p.type === 'goi' ? 'Gói tháng' : 'Tiền chơi lẻ'}"`,
      `"${p.reference.replace(/"/g, '""')}"`,
      `"${p.who.replace(/"/g, '""')}"`,
      p.amount,
    ]);
    const total = filteredPayments.reduce((sum, item) => sum + item.amount, 0);
    rows.push(['TỔNG CỘNG', '', '', `"${filteredPayments.length} giao dịch"`, '', total]);
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

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Dự báo AI-2
  const forecastHours = useMemo(() => {
    const hours = [];
    const openH = dashboard.config.openingHour || 6;
    const closeH = dashboard.config.closingHour || 21;

    for (let h = openH; h < closeH; h++) {
      const activeBookings = (dashboard.bookings || []).filter((b) => {
        if (['CANCELLED', 'CHECKED_OUT'].includes(b.status)) return false;
        const bDate = b.startTime.slice(0, 10);
        if (bDate !== selectedDate) return false;
        const bStart = new Date(b.startTime).getHours();
        const bEnd = bStart + b.duration;
        return h >= bStart && h < bEnd;
      });

      const activeClasses = (dashboard.classes || []).filter((c) => {
        if (c.status !== 'approved') return false;
        const cDate = c.date.slice(0, 10);
        if (cDate !== selectedDate) return false;
        return h >= c.startHour && h < c.endHour;
      });

      const bookedTablesCount = activeBookings.length;
      const classTablesCount = activeClasses.reduce((sum, c) => sum + (c.tables?.length || 1), 0);
      const occupiedTables = Math.min(16, bookedTablesCount + classTablesCount);

      const ratio = occupiedTables / 16;
      const heightPct = Math.round(ratio * 100);

      let level: 'low' | 'med' | 'high' = 'low';
      let levelLabel = 'Thấp';
      let color = '#27ae60';
      if (ratio >= 0.7) {
        level = 'high';
        levelLabel = 'Cao';
        color = '#c0392b';
      } else if (ratio >= 0.4) {
        level = 'med';
        levelLabel = 'Vừa';
        color = '#f39c12';
      } else if (occupiedTables === 0) {
        levelLabel = 'Trống';
        color = '#94a3b8';
      }

      hours.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        ratio,
        heightPct,
        level,
        levelLabel,
        color,
        occupiedTables,
        bookedTablesCount,
        classTablesCount,
      });
    }
    return hours;
  }, [dashboard.bookings, dashboard.classes, dashboard.config, selectedDate]);

  const highHours = forecastHours.filter((h) => h.level === 'high');
  const medHours = forecastHours.filter((h) => h.level === 'med');
  const maxOccupied = Math.max(...forecastHours.map((h) => h.occupiedTables), 0);
  const totalOccupiedSessions = forecastHours.reduce((sum, h) => sum + h.occupiedTables, 0);

  let aiInsight = '';
  if (highHours.length > 0) {
    const hoursStr = highHours.map((h) => h.label).join(', ');
    aiInsight = `Khung giờ cao điểm thực tế rơi vào ${hoursStr} (mật độ Cao ≥ 70%, cao nhất đạt ${maxOccupied}/16 bàn). Đề xuất quản lý bố trí đủ 2 nhân viên quầy trực hỗ trợ check-in và điều phối hàng chờ.`;
  } else if (medHours.length > 0) {
    const hoursStr = medHours.map((h) => h.label).join(', ');
    aiInsight = `Nhu cầu sử dụng sân ở mức vừa phải (tập trung vào các khung giờ ${hoursStr}, cao nhất ${maxOccupied}/16 bàn). Bố trí 1–2 nhân viên phục vụ là phù hợp.`;
  } else if (totalOccupiedSessions > 0) {
    aiInsight = `Mật độ sân trong ngày ở mức thấp (cao nhất ${maxOccupied}/16 bàn). 1 nhân viên quầy trực là đủ đảm bảo vận hành.`;
  } else {
    aiInsight = `Chưa ghi nhận đơn đặt sân hoặc lớp học nào trong ngày ${new Date(selectedDate).toLocaleDateString('vi-VN')}. Toàn bộ 16 bàn đang trống và sẵn sàng tiếp nhận khách.`;
  }

  const filteredLogs = useMemo(() => {
    if (!auditSearch.trim()) return systemLogs;
    const q = auditSearch.toLowerCase();
    return systemLogs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.actorEmail.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.actorRole.toLowerCase().includes(q)
    );
  }, [systemLogs, auditSearch]);

  return (
    <>
      <div className="pg-h" style={{ marginBottom: 12 }}>
        <div>
          <h2>{isManager ? 'Quản lý & Thống kê hệ thống' : 'Báo cáo doanh thu & Trực hỗ trợ'}</h2>
          <p>
            {isManager
              ? 'Phân hệ quản lý toàn quyền: Doanh thu theo kỳ, tiếp nhận chuyển tiếp từ Chatbot, dự báo AI và nhật ký kiểm toán.'
              : 'Phân hệ nhân viên: Theo dõi doanh thu trong ngày và tiếp nhận các cuộc hội thoại chuyển tiếp từ Chatbot AI.'}
          </p>
        </div>
      </div>

      {/* Tabs điều hướng */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          className={`btn ${activeTab === 'revenue' ? '' : 'ghost'}`}
          type="button"
          onClick={() => setActiveTab('revenue')}
        >
          💰 Báo cáo Doanh thu {isStaff && '(Chỉ Trong ngày)'}
        </button>
        <button
          className={`btn ${activeTab === 'transfers' ? '' : 'ghost'}`}
          type="button"
          onClick={() => setActiveTab('transfers')}
          style={{ position: 'relative' }}
        >
          💬 Chuyển tiếp từ Chatbot
          {conversations.filter((c) => c.status !== 'RESOLVED').length > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                borderRadius: '50%',
                padding: '2px 7px',
                fontSize: 11,
                marginLeft: 6,
                fontWeight: 'bold',
              }}
            >
              {conversations.filter((c) => c.status !== 'RESOLVED').length}
            </span>
          )}
        </button>
        {isManager ? (
          <button
            className={`btn ${activeTab === 'audit' ? '' : 'ghost'}`}
            type="button"
            onClick={() => setActiveTab('audit')}
          >
            🛡️ Nhật ký kiểm toán & Truy vết
          </button>
        ) : (
          <button
            className="btn ghost"
            type="button"
            onClick={() => onNotify('Quyền hạn bị từ chối: Chỉ Quản lý mới được phép xem nhật ký kiểm toán hệ thống.')}
            style={{ opacity: 0.6 }}
            title="Chỉ dành cho Quản lý"
          >
            🔒 Nhật ký kiểm toán (Chỉ Quản lý)
          </button>
        )}
      </div>

      {/* TAB 1: DOANH THU & BÁO CÁO */}
      {activeTab === 'revenue' && (
        <>
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {isStaff ? 'Doanh thu Trong ngày (Phân quyền Nhân viên)' : 'Báo cáo Doanh thu Tổng hợp'}
                </h3>
                <p className="hint" style={{ margin: '2px 0 0' }}>
                  {isStaff
                    ? 'Nhân viên chỉ có quyền xem doanh thu trong ngày hôm nay. Không được xem doanh thu tuần/tháng hoặc xuất báo cáo.'
                    : 'Quản lý xem báo cáo doanh thu theo ngày, tuần, tháng, quý, năm và xuất báo cáo CSV/Excel.'}
                </p>
              </div>

              {/* Bộ lọc kỳ: Nhân viên bị khóa chỉ chọn được 'Hôm nay' */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isStaff ? (
                  <span className="tag t-bl" style={{ padding: '6px 12px', fontSize: 13 }}>
                    🔒 Cố định: Hôm nay ({todayStr})
                  </span>
                ) : (
                  <>
                    <button className={`btn sm ${periodFilter === 'all' ? '' : 'ghost'}`} type="button" onClick={() => setPeriodFilter('all')}>Toàn thời gian</button>
                    <button className={`btn sm ${periodFilter === 'today' ? '' : 'ghost'}`} type="button" onClick={() => setPeriodFilter('today')}>Hôm nay</button>
                    <button className={`btn sm ${periodFilter === 'week' ? '' : 'ghost'}`} type="button" onClick={() => setPeriodFilter('week')}>Tuần này</button>
                    <button className={`btn sm ${periodFilter === 'month' ? '' : 'ghost'}`} type="button" onClick={() => setPeriodFilter('month')}>Tháng này</button>
                  </>
                )}
              </div>
            </div>

            <div className="kpi" style={{ marginTop: 12 }}>
              <div style={{ background: '#f8fafc', border: '2px solid #3b82f6', borderRadius: 8, padding: 12 }}>
                <b style={{ color: '#0f172a' }}>{money(todayRevenue)}</b>
                <span>Doanh thu Hôm nay ({todayStr})</span>
              </div>
              <div style={{ background: isStaff ? '#f1f5f9' : '#eff6ff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
                <b style={{ color: isStaff ? '#94a3b8' : '#1d4ed8' }}>
                  {isStaff ? '🔒 Chỉ Quản lý' : money(weekRevenue)}
                </b>
                <span>Doanh thu Tuần này</span>
              </div>
              <div style={{ background: isStaff ? '#f1f5f9' : '#f0fdf4', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
                <b style={{ color: isStaff ? '#94a3b8' : '#15803d' }}>
                  {isStaff ? '🔒 Chỉ Quản lý' : money(monthRevenue)}
                </b>
                <span>Doanh thu Tháng này</span>
              </div>
              <div style={{ background: isStaff ? '#f1f5f9' : '#faf5ff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
                <b style={{ color: isStaff ? '#94a3b8' : '#7e22ce' }}>
                  {isStaff ? '🔒 Chỉ Quản lý' : money(dashboard.stats.totalRevenue)}
                </b>
                <span>Tổng tích lũy</span>
              </div>
            </div>
          </section>

          {/* Phân hệ AI-2 Dự báo Giờ cao điểm - CHỈ QUẢN LÝ ĐƯỢC XEM */}
          {isManager && (
            <section className="card" style={{ marginTop: 16 }}>
              <div className="pg-h" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <span>🤖 AI-2 Dự báo mật độ & giờ cao điểm</span>
                    <span className="tag" style={{ background: '#1d4ba8', color: '#fff' }}>Dữ liệu thực tế</span>
                  </h3>
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    Phân tích tỷ lệ chiếm dụng sân theo thời gian thực từ các đơn đặt bàn và lịch lớp học đã duyệt.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label htmlFor="forecast-date" style={{ fontSize: 13, fontWeight: 'bold' }}>Ngày xem:</label>
                    <input
                      id="forecast-date"
                      type="date"
                      className="in"
                      style={{ padding: '4px 8px', fontSize: 13, width: 'auto' }}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                  <div className="legend" style={{ display: 'flex', gap: 6 }}>
                    <span className="tag" style={{ background: '#eafaf1', color: '#27ae60', border: '1px solid #27ae60' }}>Thấp (&lt;40%)</span>
                    <span className="tag" style={{ background: '#fef9e7', color: '#f39c12', border: '1px solid #f39c12' }}>Vừa (40-69%)</span>
                    <span className="tag" style={{ background: '#fdedec', color: '#c0392b', border: '1px solid #c0392b' }}>Cao (≥70%)</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 190, padding: '20px 10px 10px', background: 'var(--surface2, #f8f9fa)', borderRadius: 8, overflowX: 'auto' }}>
                {forecastHours.map((item) => (
                  <div
                    key={item.hour}
                    style={{ flex: '1 1 0', minWidth: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                    title={`${item.label}: Thực tế chiếm dụng ${item.occupiedTables}/16 bàn (${item.heightPct}%) · Khách đặt: ${item.bookedTablesCount} bàn, Lớp học: ${item.classTablesCount} bàn`}
                  >
                    <small style={{ fontSize: 10, color: item.color, fontWeight: 'bold' }}>{item.levelLabel}</small>
                    <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'flex-end', background: '#e2e8f0', borderRadius: 4 }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.max(item.heightPct, 4)}%`,
                          background: item.color,
                          borderRadius: 4,
                          transition: 'height 0.4s ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: item.level === 'high' ? 'bold' : 'normal', color: item.level === 'high' ? '#c0392b' : 'inherit' }}>
                      {item.hour}h
                    </span>
                    <small style={{ fontSize: 10, color: '#64748b' }}>{item.occupiedTables} bàn</small>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0f4fc', borderRadius: 6, fontSize: 13, color: '#103070', lineHeight: 1.5 }}>
                💡 <b>Nhận định vận hành AI ({new Date(selectedDate).toLocaleDateString('vi-VN')}):</b> {aiInsight}
              </div>
            </section>
          )}

          {/* Nhật ký thanh toán */}
          <section className="card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  Nhật ký thanh toán ({isStaff ? 'Hôm nay' : periodFilter === 'all' ? 'Toàn bộ' : periodFilter === 'today' ? 'Hôm nay' : periodFilter === 'week' ? 'Tuần này' : 'Tháng này'})
                </h3>
                <small className="hint">{filteredPayments.length} giao dịch ghi nhận</small>
              </div>

              {isManager ? (
                <button className="btn" type="button" onClick={exportCSV} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span>📥 Xuất báo cáo (CSV/Excel)</span>
                </button>
              ) : (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => onNotify('Lỗi 403: Nhân viên không được phép xuất báo cáo. Quyền hạn chỉ dành cho Quản lý!')}
                  style={{ opacity: 0.6 }}
                >
                  🔒 Xuất báo cáo (Chỉ Quản lý)
                </button>
              )}
            </div>

            <div className="ovf" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Khoản thu</th>
                    <th>Nhân viên thu</th>
                    <th className="num">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#64748b', padding: '18px 0' }}>
                        Chưa có giao dịch thanh toán nào trong kỳ {effectivePeriod === 'today' ? 'hôm nay' : 'này'}.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="num">{new Date(payment.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
                        <td>{payment.reference} <span className={`tag ${payment.type === 'goi' ? 't-bl' : 't-ok'}`}>{payment.type === 'goi' ? 'Gói' : 'Tiền chơi'}</span></td>
                        <td>{payment.who}</td>
                        <td className="num">{money(payment.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* TAB 2: HỘI THOẠI CHUYỂN TIẾP TỪ CHATBOT (MỤC 2) */}
      {activeTab === 'transfers' && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>💬 Hội thoại Chatbot chuyển tiếp ({conversations.length})</h3>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                Khi Chatbot có độ tin cậy dưới 80%, hệ thống tự động chuyển tiếp cuộc trò chuyện sang Nhân viên trực quầy (hoặc Quản lý nếu nhân viên vắng mặt). Chatbot sẽ dừng phản hồi để nhân sự trực tiếp hỗ trợ khách hàng.
              </p>
            </div>
            <button className="btn sm ghost" type="button" onClick={loadConversations} disabled={loadingConv}>
              {loadingConv ? 'Đang tải...' : '🔄 Làm mới'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selectedConv ? '1fr 1fr' : '1fr', gap: 16 }}>
            {/* Danh sách các cuộc hội thoại */}
            <div className="ovf">
              <table>
                <thead>
                  <tr>
                    <th>Mã hội thoại</th>
                    <th>Khách hàng</th>
                    <th>Thời gian</th>
                    <th>Độ tin cậy</th>
                    <th>Người tiếp nhận</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                        Hiện không có cuộc hội thoại nào cần tiếp nhận từ Chatbot.
                      </td>
                    </tr>
                  ) : (
                    conversations.map((conv) => (
                      <tr
                        key={conv.id}
                        style={{
                          background: selectedConv?.id === conv.id ? 'var(--surface2, #f0f7ff)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedConv(conv)}
                      >
                        <td>
                          <b>{conv.id}</b>
                          <br />
                          <small style={{ color: '#64748b' }}>{conv.reason}</small>
                        </td>
                        <td>
                          <b>{conv.customerName}</b>
                          <br />
                          <span className="tag t-bl" style={{ fontSize: 10 }}>{conv.customerRole}</span>{' '}
                          <small style={{ color: '#64748b' }}>{conv.customerPhone || conv.customerEmail}</small>
                        </td>
                        <td>{new Date(conv.transferredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
                        <td>
                          <span
                            className="tag"
                            style={{
                              background: conv.confidence < 80 ? '#fee2e2' : '#dcfce7',
                              color: conv.confidence < 80 ? '#b91c1c' : '#15803d',
                              fontWeight: 'bold',
                            }}
                          >
                            {conv.confidence}% {conv.confidence < 80 ? '(< 80%)' : ''}
                          </span>
                        </td>
                        <td>
                          <span className="tag t-ok">{conv.assignedTo?.name || 'Nhân viên'}</span>
                        </td>
                        <td>
                          {conv.status === 'PENDING' && <span className="tag t-am">Chờ xử lý</span>}
                          {conv.status === 'ACCEPTED' && <span className="tag t-bl">Đang chat</span>}
                          {conv.status === 'RESOLVED' && <span className="tag t-ok">Đã hoàn tất</span>}
                        </td>
                        <td>
                          <button
                            className="btn sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedConv(conv);
                            }}
                          >
                            Mở chat
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Chi tiết và ô chat với khách hàng */}
            {selectedConv && (
              <div
                style={{
                  border: '1px solid var(--border, #cbd5e1)',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 520,
                  background: 'var(--surface, #ffffff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                  <div>
                    <h4 style={{ margin: 0 }}>Hội thoại {selectedConv.id}</h4>
                    <small style={{ color: '#64748b' }}>
                      Khách hàng: <b>{selectedConv.customerName}</b> ({selectedConv.customerPhone || selectedConv.customerEmail || 'Chưa cung cấp liên hệ'})
                    </small>
                    <div style={{ marginTop: 4 }}>
                      <span className="tag" style={{ background: '#fef3c7', color: '#b45309', fontSize: 11 }}>
                        Lý do: {selectedConv.reason} (Độ tin cậy {selectedConv.confidence}%)
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {isStaff && selectedConv.status !== 'RESOLVED' && selectedConv.assignedTo?.role !== 'MANAGER' && (
                      <button
                        className="btn sm"
                        type="button"
                        style={{ background: '#d97706', color: '#fff', borderColor: '#d97706', fontWeight: 'bold' }}
                        onClick={() => handleEscalateToManager(selectedConv.id)}
                        title="Chuyển cuộc hội thoại này qua Quản lý khi nhân viên không trả lời được"
                      >
                        ↗ Chuyển qua Quản lý
                      </button>
                    )}
                    {selectedConv.status !== 'RESOLVED' && (
                      <button
                        className="btn sm"
                        type="button"
                        style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}
                        onClick={() => handleResolve(selectedConv.id)}
                      >
                        ✓ Đã hỗ trợ xong
                      </button>
                    )}
                    <button className="btn sm ghost" type="button" onClick={() => setSelectedConv(null)}>
                      ✕
                    </button>
                  </div>
                </div>

                {/* Danh sách tin nhắn */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4, marginBottom: 12 }}>
                  {selectedConv.messages.map((m) => {
                    const isAgent = m.sender === 'agent';
                    const isSystem = m.sender === 'system';
                    if (isSystem) {
                      return (
                        <div key={m.id} style={{ textAlign: 'center', margin: '4px 0' }}>
                          <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 4 }}>
                            ⚙️ {m.text} ({m.time})
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isAgent ? 'flex-end' : 'flex-start',
                          maxWidth: '80%',
                          background: isAgent ? '#2563eb' : '#f1f5f9',
                          color: isAgent ? '#ffffff' : '#0f172a',
                          padding: '8px 12px',
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2, fontWeight: 'bold' }}>
                          {m.senderName} • {m.time}
                        </div>
                        <div>{m.text}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Nhập phản hồi */}
                {selectedConv.status !== 'RESOLVED' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendReply();
                    }}
                    style={{ display: 'flex', gap: 8 }}
                  >
                    <input
                      type="text"
                      className="in"
                      placeholder={`Phản hồi với vai trò ${user.name} (${user.role})...`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={sendingReply}
                      style={{ flex: 1 }}
                    />
                    <button className="btn" type="submit" disabled={sendingReply || !replyText.trim()}>
                      {sendingReply ? 'Đang gửi...' : 'Gửi'}
                    </button>
                  </form>
                ) : (
                  <div style={{ padding: '8px', background: '#f0fdf4', color: '#166534', borderRadius: 6, fontSize: 13, textAlign: 'center' }}>
                    Cuộc trò chuyện này đã được đánh dấu hoàn tất.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: NHẬT KÝ KIỂM TOÁN VÀ TRUY VẾT - CHỈ DÀNH CHO QUẢN LÝ (MỤC 9) */}
      {activeTab === 'audit' && isManager && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>🛡️ Nhật ký kiểm toán & Truy vết hệ thống (Audit Logs)</h3>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                Ghi nhận tự động tất cả các thao tác nhạy cảm: Chuyển tiếp hội thoại chatbot, tạo tài khoản khách tháng, thay đổi vai trò, đổi mật khẩu lần đầu, quét gói tháng hết hạn và chỉnh sửa cấu hình.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="in sm"
                placeholder="Tìm kiếm theo hành động, email, vai trò..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                style={{ width: 260 }}
              />
              <button className="btn sm ghost" type="button" onClick={loadAuditLogs} disabled={loadingLogs}>
                {loadingLogs ? 'Đang tải...' : '🔄 Làm mới'}
              </button>
            </div>
          </div>

          <div className="ovf">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Vai trò</th>
                  <th>Hành động</th>
                  <th>Chi tiết truy vết</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                      Chưa ghi nhận sự kiện kiểm toán nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString('vi-VN')}
                      </td>
                      <td><b>{log.actorEmail}</b></td>
                      <td>
                        <span className={`tag ${log.actorRole === 'MANAGER' ? 't-rd' : log.actorRole === 'STAFF' ? 't-bl' : 't-gr'}`}>
                          {log.actorRole}
                        </span>
                      </td>
                      <td><b>{log.action}</b></td>
                      <td style={{ maxWidth: 450, wordBreak: 'break-word', fontSize: 12 }}>
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

interface SettingActionLog {
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

  const [logs, setLogs] = useState<SettingActionLog[]>([]);

  if (user.role !== 'MANAGER') {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <h3>Quyền truy cập bị từ chối</h3>
        <p className="hint">Chức năng Cấu hình hệ thống và Nhật ký AI chỉ dành riêng cho Quản trị viên (Manager). Giáo viên và các vai trò khác không có quyền truy cập trang này.</p>
      </section>
    );
  }

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

      const newLog: SettingActionLog = {
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

      {/* Nhật ký AI - Chỉ Quản lý mới có quyền xem, đã loại bỏ hoàn toàn đối với vai trò Giáo viên và nhân sự khác */}
      {user.role === 'MANAGER' && (
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
      )}
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
