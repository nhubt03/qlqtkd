import { useState, type FormEvent } from 'react';
import type { User } from '../../types';
import { firstLoginChangePassword } from '../../services/api';

interface FirstLoginPasswordModalProps {
  user: User;
  onSuccess: (updatedUser: User) => void;
  onNotify: (msg: string) => void;
}

export function FirstLoginPasswordModal({ user, onSuccess, onNotify }: FirstLoginPasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('123456');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword || newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword === '123456') {
      setError('Mật khẩu mới không được trùng với mật khẩu mặc định 123456.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await firstLoginChangePassword({
        userId: user.id,
        oldPassword,
        newPassword,
      });

      if (res.ok) {
        onNotify('Đổi mật khẩu lần đầu thành công! Tài khoản của bạn đã được kích hoạt an toàn.');
        onSuccess(res.user);
      } else {
        setError(res.message || 'Không thể đổi mật khẩu.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi đổi mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--card-bg, #ffffff)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          border: '1.5px solid #dc2626',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 12px',
            }}
          >
            🔒
          </div>
          <h2 style={{ fontSize: 20, margin: '0 0 6px', color: '#0f172a' }}>
            Bắt Buộc Đổi Mật Khẩu Lần Đầu
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Tài khoản khách tháng của bạn <b>{user.name}</b> được cấp mật khẩu mặc định (123456). Theo quy định an toàn bảo mật, bạn bắt buộc phải thiết lập mật khẩu mới trước khi sử dụng hệ thống.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Mật khẩu hiện tại (Mặc định)
            </label>
            <input
              type="password"
              className="in"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="123456"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Mật khẩu mới (Tối thiểu 6 ký tự)
            </label>
            <input
              type="password"
              className="in"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới..."
              required
              minLength={6}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Xác nhận mật khẩu mới
            </label>
            <input
              type="password"
              className="in"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới..."
              required
              minLength={6}
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            className="btn red"
            disabled={submitting}
            style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600 }}
          >
            {submitting ? 'Đang cập nhật mật khẩu...' : '✓ Xác Nhận Đổi Mật Khẩu & Bắt Đầu'}
          </button>
        </form>
      </div>
    </div>
  );
}

