import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Button, Input, ThemePicker, Icon } from '../components/UI';
import { Brand } from '../components/Shell';
import { save, errorMessage } from '../services/api';
import { useAuth } from '../stores/ui';
export function Login() {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const setUser = useAuth((s) => s.setUser),
    navigate = useNavigate(),
    reduce = useReducedMotion();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await save<{ username: string }>('/login', { username, password }, 'POST');
      setUser(data.username);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-art">
        <Brand href="/" />
        <div className="login-copy">
          <div className="login-motif" aria-hidden="true">
            {[18, 30, 48, 66, 42, 28, 54, 76, 58, 36, 22, 46, 64, 40, 24].map((h, n) => (
              <motion.i
                key={n}
                style={{ height: h }}
                animate={reduce ? undefined : { scaleY: [1, 0.6, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, delay: n * 0.09, ease: 'easeInOut' }}
              />
            ))}
          </div>
          <div className="upper">YOUR SERVER. YOUR CONTROL.</div>
          <h1>
            Mọi hoạt động.
            <br />
            Một nơi quản lý.
          </h1>
          <p>
            Kết nối cộng đồng, theo dõi hoạt động và điều khiển âm nhạc trong một không gian gọn
            gàng.
          </p>
          <div className="login-features">
            <span>
              <Icon name="shield" />
              Truy cập an toàn
            </span>
            <span>
              <Icon name="pulse" />
              Trạng thái trực tiếp
            </span>
          </div>
        </div>
        <div className="login-footer">
          <span>DISCORD CONTROL</span>
          <span>SELF-HOSTED MANAGEMENT</span>
        </div>
      </section>
      <section className="login-form-side">
        <Link to="/" className="login-home-link">← Về trang chủ</Link>
        <div className="login-theme">
          <ThemePicker />
        </div>
        <motion.form
          className="login-form"
          onSubmit={submit}
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        >
          <h2>Chào mừng trở lại</h2>
          <p className="description">Đăng nhập để quản lý hệ thống Discord của bạn.</p>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
          <Input
            label="Tên đăng nhập"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="Nhập tên đăng nhập"
            required
            autoFocus
          />
          <Input
            label="Mật khẩu"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            required
          />
          <Button fullWidth loading={busy} type="submit">
            Đăng nhập <Icon name="arrow" />
          </Button>
          <p className="login-hint">
            <Icon name="shield" size={12} /> Phiên đăng nhập được bảo vệ trên thiết bị này.
          </p>
        </motion.form>
      </section>
    </main>
  );
}
