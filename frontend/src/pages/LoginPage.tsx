import { useEffect, useState, type FormEvent } from 'react';
import { isValidEmail, isValidVietnamPhone, validateCustomerContact } from '../utils/validation';
import { sendRegisterOtp, registerUser } from '../services/api';

interface LoginPageProps {
  error: string;
  onLogin: (identifier: string, password: string) => Promise<void>;
}

export function LoginPage({ error, onLogin }: LoginPageProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [registerMessage, setRegisterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Trạng thái cho form đăng ký
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isTeacher, setIsTeacher] = useState(false);

  // Đếm ngược thời gian gửi lại OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    const trimmedId = identifier.trim();
    if (!trimmedId) {
      setFormError('Vui lòng nhập email hoặc số điện thoại.');
      return;
    }

    const isPhoneLike = /^[0-9+]+$/.test(trimmedId);
    if (isPhoneLike) {
      if (!isValidVietnamPhone(trimmedId)) {
        setFormError('Số điện thoại không đúng chuẩn di động Việt Nam (10 số, bắt đầu 03, 05, 07, 08, 09).');
        return;
      }
    } else {
      if (!isValidEmail(trimmedId)) {
        setFormError('Email đăng nhập không đúng định dạng.');
        return;
      }
    }

    if (!password) {
      setFormError('Vui lòng nhập mật khẩu.');
      return;
    }

    setSubmitting(true);
    try {
      await onLogin(trimmedId, password);
    } catch {
      // The API error is shown by the parent.
    } finally {
      setSubmitting(false);
    }
  };

  // Gửi mã OTP xác thực qua email
  const handleSendOtp = async () => {
    if (!regEmail || !isValidEmail(regEmail)) {
      setRegisterMessage('Vui lòng nhập địa chỉ Email hợp lệ trước khi nhận mã OTP.');
      return;
    }
    setSendingOtp(true);
    setRegisterMessage('');
    try {
      const res = await sendRegisterOtp(regEmail.trim(), regName.trim());
      setOtpSent(true);
      setOtpCooldown(60);
      setRegisterMessage(res.message || `Mã OTP đã được gửi đến email ${regEmail}. Vui lòng kiểm tra hộp thư.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Không thể gửi mã OTP qua email. Vui lòng thử lại.';
      setRegisterMessage(msg);
    } finally {
      setSendingOtp(false);
    }
  };

  const submitRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegisterMessage('');

    const validation = validateCustomerContact(regName, regPhone, regEmail, true);
    if (!validation.valid) {
      setRegisterMessage(validation.errors[0]);
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setRegisterMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (!otpSent) {
      setRegisterMessage('Vui lòng nhấn "Nhận mã OTP qua Email" để lấy mã xác thực.');
      return;
    }
    if (!regOtp || regOtp.trim().length !== 6) {
      setRegisterMessage('Vui lòng nhập đúng 6 chữ số mã xác thực OTP đã được gửi vào email của bạn.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerUser({
        ho_ten: regName.trim(),
        sdt: regPhone.trim(),
        email: regEmail.trim(),
        mat_khau: regPassword,
        otp: regOtp.trim(),
        vai_tro: isTeacher ? 'TEACHER' : 'GUEST',
      });

      setRegisterMessage(`✓ ${res.message || 'Đăng ký tài khoản thành công!'} Đang chuyển sang tab Đăng nhập...`);
      setIdentifier(regEmail.trim());
      setPassword(regPassword);
      setTimeout(() => {
        setTab('login');
        setRegisterMessage('');
      }, 2000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Đăng ký tài khoản thất bại. Vui lòng kiểm tra lại.';
      setRegisterMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <section className="login-hero" aria-label="PingPongBros">
        <div className="login-brand">
          <Paddle />
          <b>PINGPONGBROS</b>
        </div>
        <h1>Thể thao là không ngừng <em>bỏ cuộc!</em></h1>
        <svg viewBox="0 0 560 300" role="img" aria-label="Bàn bóng bàn, hai vợt và quả bóng">
          <rect x="40" y="70" width="400" height="190" rx="10" fill="#1d4ba8" stroke="#fff" strokeWidth="5" />
          <line x1="240" y1="70" x2="240" y2="260" stroke="#fff" strokeWidth="4" />
          <line x1="40" y1="165" x2="440" y2="165" stroke="#ffffff88" strokeWidth="2" />
          <rect x="236" y="56" width="8" height="218" fill="#ffffffcc" />
          <g stroke="#fff" strokeWidth="3"><line x1="70" y1="260" x2="70" y2="290" /><line x1="410" y1="260" x2="410" y2="290" /></g>
          <circle cx="470" cy="70" r="54" fill="#8c1c2c" stroke="#fff" strokeWidth="5" />
          <circle cx="470" cy="70" r="36" fill="none" stroke="#ffffff55" strokeWidth="3" />
          <rect x="456" y="118" width="28" height="64" rx="12" transform="rotate(-24 470 150)" fill="#e9d7b5" stroke="#fff" strokeWidth="4" />
          <circle cx="355" cy="40" r="13" fill="#fff" />
          <path d="M335 62 Q300 90 262 118" stroke="#ffffff66" strokeWidth="3" fill="none" strokeDasharray="6 7" />
        </svg>
        <p className="sub">16 bàn, 4 dãy, mở cửa 06:00–21:00 tại Đà Nẵng. Đặt bàn trước, nhận mã bàn, đến sân và chơi.</p>
      </section>

      <section className="login-pane">
        <div className="login-box">
          <div className="tabs" role="tablist">
            <button
              className={`tab ${tab === 'login' ? 'active' : ''}`}
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => {
                setTab('login');
                setFormError('');
                setRegisterMessage('');
              }}
            >
              Đăng nhập
            </button>
            <button
              className={`tab ${tab === 'register' ? 'active' : ''}`}
              role="tab"
              aria-selected={tab === 'register'}
              onClick={() => {
                setTab('register');
                setFormError('');
                setRegisterMessage('');
              }}
            >
              Đăng ký tài khoản
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={submitLogin} noValidate>
              <div className="login-fields">
                <div>
                  <label htmlFor="login-id">Email hoặc Số điện thoại</label>
                  <input
                    className="in"
                    id="login-id"
                    autoComplete="username"
                    placeholder="quanly@pingpongbros.vn hoặc 0905123456"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="login-pass">Mật khẩu</label>
                  <input
                    className="in"
                    id="login-pass"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button className="btn" type="submit" disabled={submitting}>
                  {submitting ? 'Đang xác thực...' : 'Vào hệ thống'}
                </button>
              </div>

              {(formError || error) && <p className="err" role="alert">{formError || error}</p>}

              <div className="login-quick">
                <small>Tài khoản mẫu để thử nghiệm nhanh:</small>
                <div className="login-tags">
                  <button type="button" onClick={() => { setIdentifier('quanly@pingpongbros.vn'); setPassword('123456'); }}>Quản lý</button>
                  <button type="button" onClick={() => { setIdentifier('nhanvien@pingpongbros.vn'); setPassword('123456'); }}>Nhân viên</button>
                  <button type="button" onClick={() => { setIdentifier('giaovien@pingpongbros.vn'); setPassword('123456'); }}>Giáo viên</button>
                  <button type="button" onClick={() => { setIdentifier('khachthang@gmail.com'); setPassword('123456'); }}>Khách tháng</button>
                  <button type="button" onClick={() => { setIdentifier('vanglai@gmail.com'); setPassword('123456'); }}>Khách vãng lai</button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={submitRegister} noValidate>
              <div className="login-fields">
                <div>
                  <label htmlFor="register-name">Họ và tên</label>
                  <input
                    className="in"
                    id="register-name"
                    autoComplete="name"
                    placeholder="Nguyễn Văn A"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="register-phone">Số điện thoại (Việt Nam)</label>
                  <input
                    className="in"
                    id="register-phone"
                    inputMode="tel"
                    placeholder="09xx xxx xxx"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="register-email">Địa chỉ Email (Nhận mã OTP)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="in"
                      id="register-email"
                      inputMode="email"
                      placeholder="ten@gmail.com"
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        setOtpSent(false);
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn ghost sm"
                      type="button"
                      disabled={sendingOtp || otpCooldown > 0}
                      onClick={handleSendOtp}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {sendingOtp ? 'Đang gửi...' : otpCooldown > 0 ? `${otpCooldown}s` : 'Nhận OTP'}
                    </button>
                  </div>
                </div>

                {/* KHUNG NHẬP MÃ OTP GỬI VỀ EMAIL */}
                {otpSent && (
                  <div className="full" style={{ background: '#f0f7ff', border: '1px dashed #0066cc', padding: '10px 12px', borderRadius: 8, marginTop: 4 }}>
                    <label htmlFor="register-otp" style={{ fontWeight: 'bold', color: '#0066cc', fontSize: 13 }}>
                      Mã xác thực OTP (6 chữ số trong Email)
                    </label>
                    <input
                      className="in"
                      id="register-otp"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Nhập mã 6 số (ví dụ: 582910)"
                      value={regOtp}
                      onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, ''))}
                      style={{ letterSpacing: 4, fontWeight: 'bold', fontSize: 16, marginTop: 4 }}
                    />
                    <small style={{ color: '#475569', display: 'block', marginTop: 4, fontSize: 11 }}>
                      Mã đã được gửi đến <b>{regEmail}</b>. Vui lòng kiểm tra hộp thư đến (hoặc thư mục Spam).
                    </small>
                  </div>
                )}

                <div>
                  <label htmlFor="register-password">Mật khẩu</label>
                  <input
                    className="in"
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                <div className="full">
                  <label className="gvchk">
                    <input type="checkbox" checked={isTeacher} onChange={(e) => setIsTeacher(e.target.checked)} />
                    <span>Bạn là giáo viên và bạn muốn đặt lịch cho lớp học</span>
                  </label>
                </div>
                <div className="full">
                  <button className="btn" style={{ width: '100%' }} type="submit" disabled={submitting}>
                    {submitting ? 'Đang tạo tài khoản...' : 'Xác thực OTP & Tạo tài khoản'}
                  </button>
                </div>
              </div>
              {registerMessage && (
                <p className={registerMessage.includes('✓') || registerMessage.includes('gửi về') || registerMessage.includes('thành công') ? 'hint t-ok' : 'err'} role="status" style={{ marginTop: 10 }}>
                  {registerMessage}
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function Paddle() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
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
