import { useState, type FormEvent } from 'react';
import { isValidEmail, isValidVietnamPhone, validateCustomerContact } from '../utils/validation';

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
  const [isTeacher, setIsTeacher] = useState(false);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    const trimmedId = identifier.trim();
    if (!trimmedId) {
      setFormError('Vui lòng nhập email hoặc số điện thoại.');
      return;
    }

    // Kiểm tra định dạng đầu vào đăng nhập
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

  const submitRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegisterMessage('');

    const validation = validateCustomerContact(regName, regPhone, regEmail, false);
    if (!validation.valid) {
      setRegisterMessage(validation.errors[0]);
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setRegisterMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    setRegisterMessage(`Đăng ký tài khoản thành công cho ${regName}! Hãy chuyển sang tab Đăng nhập để sử dụng.`);
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

      <section className="login-box">
        <div className="card">
          <div className="tabs" role="tablist" aria-label="Tài khoản">
            <button type="button" role="tab" aria-selected={tab === 'login'} onClick={() => { setTab('login'); setFormError(''); }}>Đăng nhập</button>
            <button type="button" role="tab" aria-selected={tab === 'register'} onClick={() => { setTab('register'); setRegisterMessage(''); }}>Đăng ký</button>
          </div>
          {tab === 'login' ? (
            <form onSubmit={submitLogin} noValidate>
              <div className="fg">
                <div className="full">
                  <label htmlFor="login-id">Email hoặc số điện thoại (10 số VN)</label>
                  <input
                    className="in"
                    id="login-id"
                    autoComplete="username"
                    placeholder="ten@gmail.com hoặc 09xxxxxxxx"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </div>
                <div className="full">
                  <label htmlFor="login-password">Mật khẩu</label>
                  <input
                    className="in"
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="full">
                  <label className="gvchk">
                    <input type="checkbox" checked={isTeacher} onChange={(e) => setIsTeacher(e.target.checked)} />
                    <span>Bạn là giáo viên và muốn đặt lịch cho lớp học</span>
                  </label>
                </div>
                <div className="full">
                  <button className="btn" style={{ width: '100%' }} type="submit" disabled={submitting}>
                    {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
                  </button>
                </div>
              </div>
              {(formError || error) && <p className="err" role="alert">{formError || error}</p>}
              <p className="hint" style={{ marginTop: 8 }}>
                Chưa có tài khoản? Bấm Đăng ký: lần đầu bạn vào giao diện khách vãng lai, và tự chuyển sang khách tháng khi số điện thoại hoặc email của bạn có trong danh sách gói tháng.
              </p>
              <p className="hint demo-note" style={{ marginTop: 10 }}>
                Khoá tài khoản khi nhập sai quá 5 lần không áp dụng trong bản demo.
              </p>
            </form>
          ) : (
            <form noValidate onSubmit={submitRegister}>
              <div className="fg">
                <div className="full">
                  <label htmlFor="register-name">Họ tên</label>
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
                  <label htmlFor="register-email">Email</label>
                  <input
                    className="in"
                    id="register-email"
                    inputMode="email"
                    placeholder="ten@gmail.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>
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
                  <button className="btn" style={{ width: '100%' }} type="submit">
                    Tạo tài khoản
                  </button>
                </div>
              </div>
              {registerMessage && <p className={registerMessage.includes('thành công') ? 'hint t-ok' : 'err'} role="status">{registerMessage}</p>}
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
