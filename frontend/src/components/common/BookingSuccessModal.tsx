import React from 'react';

export interface BookingSuccessInfo {
  bookingId: number;
  tableNumber: number;
  customerName: string;
  phone: string;
  date: string;
  startTime: string;
  duration: number;
  people: number;
  amount: number;
  isMember: boolean;
}

interface BookingSuccessModalProps {
  info: BookingSuccessInfo;
  onClose: () => void;
}

export function BookingSuccessModal({ info, onClose }: BookingSuccessModalProps) {
  const code = `PB-${String(info.bookingId).padStart(4, '0')}`;

  return (
    <div className="backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-success-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, textAlign: 'center', padding: '24px 20px' }}
      >
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eafaf1', color: '#27ae60', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 28 }}>
          ✓
        </div>

        <h2 id="booking-success-title" style={{ fontSize: 22, color: 'var(--brand)', marginBottom: 6 }}>
          Đặt bàn thành công!
        </h2>
        <p className="hint" style={{ fontSize: 13, marginBottom: 16 }}>
          Vui lòng cung cấp mã bàn hoặc đưa mã QR này cho nhân viên quầy khi đến sân để check-in.
        </p>

        {/* Khung hiển thị Mã bàn to rõ */}
        <div style={{ background: 'var(--surface2, #f4f6fa)', border: '2px dashed var(--brand)', borderRadius: 12, padding: '16px 12px', margin: '0 0 16px' }}>
          <small style={{ textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', fontSize: 11, fontWeight: 'bold' }}>
            Mã check-in của bạn
          </small>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 3, color: '#c0392b', margin: '4px 0' }}>
            {code}
          </div>
          <div style={{ fontWeight: 'bold', color: 'var(--brand)', fontSize: 16 }}>
            Bàn số {info.tableNumber}
          </div>

          {/* Mô phỏng mã QR SVG chất lượng cao */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <svg width="140" height="140" viewBox="0 0 140 140" style={{ background: '#fff', padding: 8, borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
              {/* Định vị góc trên trái */}
              <rect x="10" y="10" width="36" height="36" fill="#111" rx="4" />
              <rect x="16" y="16" width="24" height="24" fill="#fff" rx="2" />
              <rect x="22" y="22" width="12" height="12" fill="#111" />
              {/* Định vị góc trên phải */}
              <rect x="94" y="10" width="36" height="36" fill="#111" rx="4" />
              <rect x="100" y="16" width="24" height="24" fill="#fff" rx="2" />
              <rect x="106" y="22" width="12" height="12" fill="#111" />
              {/* Định vị góc dưới trái */}
              <rect x="10" y="94" width="36" height="36" fill="#111" rx="4" />
              <rect x="16" y="100" width="24" height="24" fill="#fff" rx="2" />
              <rect x="22" y="106" width="12" height="12" fill="#111" />
              {/* Các điểm dữ liệu barcode */}
              <rect x="52" y="16" width="8" height="8" fill="#111" />
              <rect x="68" y="16" width="8" height="8" fill="#111" />
              <rect x="60" y="28" width="8" height="8" fill="#111" />
              <rect x="76" y="28" width="8" height="8" fill="#111" />
              <rect x="52" y="52" width="16" height="16" fill="#c0392b" rx="2" />
              <rect x="76" y="52" width="8" height="8" fill="#111" />
              <rect x="94" y="52" width="12" height="8" fill="#111" />
              <rect x="18" y="56" width="8" height="8" fill="#111" />
              <rect x="34" y="68" width="10" height="8" fill="#111" />
              <rect x="52" y="76" width="12" height="12" fill="#111" />
              <rect x="72" y="76" width="8" height="16" fill="#111" />
              <rect x="94" y="76" width="16" height="8" fill="#111" />
              <rect x="114" y="76" width="8" height="16" fill="#111" />
              <rect x="52" y="100" width="8" height="16" fill="#111" />
              <rect x="68" y="108" width="16" height="8" fill="#111" />
              <rect x="94" y="100" width="20" height="8" fill="#111" />
              <rect x="100" y="116" width="16" height="8" fill="#111" />
            </svg>
          </div>
          <small className="hint" style={{ display: 'block', marginTop: 8, fontSize: 11 }}>
            Quét mã để check-in tức thì tại quầy nhân viên
          </small>
        </div>

        {/* Thông tin tóm tắt lượt đặt */}
        <div style={{ textAlign: 'left', fontSize: 13, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>Khách hàng:</span>
            <b>{info.customerName} ({info.phone})</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>Thời gian:</span>
            <b>{info.startTime} · Ngày {info.date}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>Thời lượng & Số người:</span>
            <span>{info.duration} giờ · {info.people} người</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>Hình thức thanh toán:</span>
            <b style={{ color: info.isMember ? '#27ae60' : '#c0392b' }}>
              {info.isMember ? 'Trừ lượt gói hội viên' : `${info.amount.toLocaleString('vi-VN')}đ (thu khi checkout)`}
            </b>
          </div>
        </div>

        <div style={{ padding: '8px 12px', background: '#fef9e7', border: '1px solid #f39c12', borderRadius: 6, fontSize: 12, color: '#7d6608', marginBottom: 16 }}>
          ⏱️ <b>Quy định giữ bàn:</b> Sân giữ bàn tối đa <b>15 phút</b> kể từ giờ đặt ({info.startTime}). Quá hạn bàn sẽ tự động được giải phóng cho khách chờ.
        </div>

        <button className="btn red" type="button" style={{ width: '100%', padding: '10px 0', fontSize: 15 }} onClick={onClose}>
          Tôi đã ghi nhớ mã (Đóng)
        </button>
      </div>
    </div>
  );
}
