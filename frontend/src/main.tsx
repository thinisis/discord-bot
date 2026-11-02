import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Shell } from './components/Shell';
import { Toasts } from './components/UI';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Guilds } from './pages/Guilds';
import { Music } from './pages/Music';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';
import { api } from './services/api';
import { useAuth } from './stores/ui';
import './styles/main.scss';
void i18next
  .use(initReactI18next)
  .init({
    lng: 'vi',
    fallbackLng: 'vi',
    resources: {
      vi: {
        translation: {
          common: { close: 'Đóng', cancel: 'Hủy', save: 'Lưu', loading: 'Đang tải…' },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI render error', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <div className="boot">
        <div>
          <h2>Không thể hiển thị giao diện</h2>
          <p>Vui lòng tải lại trang để khôi phục.</p>
          <button className="btn btn-secondary" onClick={() => location.reload()}>
            Tải lại
          </button>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Protected() {
  const username = useAuth((s) => s.username);
  return username ? <Shell /> : <Navigate to="/login" replace />;
}
function Application() {
  const username = useAuth((s) => s.username);
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={username ? <Navigate to="/dashboard" replace /> : <Login />}
            />
            <Route element={<Protected />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/guilds" element={<Guilds />} />
              <Route path="/music" element={<Music />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toasts />
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
window.addEventListener('session-expired', () => useAuth.getState().setUser(null));
async function start() {
  if (location.pathname !== '/login') {
    try {
      const user = await api<{ username: string }>('/me');
      useAuth.getState().setUser(user.username);
    } catch {
      useAuth.getState().setUser(null);
    }
  }
  createRoot(document.getElementById('root')!).render(<Application />);
}
void start();
