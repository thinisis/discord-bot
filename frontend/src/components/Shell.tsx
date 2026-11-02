import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button, Icon, ThemePicker } from './UI';
import { api, changed, errorMessage, type Status } from '../services/api';
import { useResource } from '../services/useResource';
import { useAuth, useUI } from '../stores/ui';
const navigation = [
  { path: '/dashboard', icon: 'grid', label: 'Tổng quan' },
  { path: '/guilds', icon: 'server', label: 'Máy chủ Discord' },
  { path: '/music', icon: 'music', label: 'Âm nhạc' },
  { path: '/logs', icon: 'logs', label: 'Nhật ký hệ thống' },
  { path: '/settings', icon: 'settings', label: 'Cài đặt' },
];
export function Brand({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link to={href} className="brand">
      <span className="brand-symbol">
        <Icon name="bot" size={22} />
      </span>
      <span className="brand-label">
        Discord Control<small>MANAGEMENT CENTER</small>
      </span>
    </Link>
  );
}
export function Shell() {
  const location = useLocation(),
    navigate = useNavigate(),
    reduce = useReducedMotion();
  const username = useAuth((s) => s.username),
    setUser = useAuth((s) => s.setUser);
  const collapsed = useUI((s) => s.collapsed),
    toggleSidebar = useUI((s) => s.toggleSidebar),
    notify = useUI((s) => s.notify);
  const [mobile, setMobile] = useState(false),
    [narrow, setNarrow] = useState(() => matchMedia('(max-width:640px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width:640px)');
    const update = () => {
      setNarrow(media.matches);
      if (!media.matches) setMobile(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const status = useResource<Status>('/status', 15000);
  const ready = !!status.data?.bot.ready;
  const current = navigation.find((n) => n.path === location.pathname) || navigation[0];
  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobile(false);
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', escape);
    };
  }, [mobile]);
  async function logout() {
    try {
      await api('/logout', { method: 'POST' });
      setUser(null);
      navigate('/login', { replace: true });
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  return (
    <div className={`app-frame ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobile ? 'open' : ''}`} id="sidebar" inert={narrow && !mobile}>
        <Brand />
        <div className="nav-section">Không gian làm việc</div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((n) => (
            <NavLink
              key={n.path}
              to={n.path}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon name={n.icon} />
              <span className="nav-label">{n.label}</span>
              {location.pathname === n.path && (
                <motion.span
                  className="active-nav-surface"
                  layoutId="active-navigation"
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 38 }
                  }
                />
              )}
            </NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          className="sidebar-collapse"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        >
          <span className={collapsed ? '' : 'rotate-icon'}>
            <Icon name="arrow" size={15} />
          </span>
          <span className="nav-label">Thu gọn</span>
        </Button>
        <div className="sidebar-bottom">
          <div className={`online-text ${ready ? '' : 'muted'}`}>
            <i className="dot" />
            <span className="nav-label">{ready ? 'Hệ thống trực tuyến' : 'Bot chưa kết nối'}</span>
          </div>
          <div className="small muted nav-label mt5">{window.location.hostname}</div>
          <div className="row user-row">
            <div className="user">{username?.slice(0, 1).toUpperCase()}</div>
            <Link
              to="/settings?tab=account"
              className="nav-label spacer"
              aria-label="Tài khoản quản trị"
            >
              <div className="small">{username}</div>
              <div className="small muted">Quản trị viên</div>
            </Link>
            <button className="icon-btn nav-label" onClick={logout} aria-label="Đăng xuất">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <AnimatePresence>
        {mobile && (
          <motion.button
            key="backdrop"
            aria-label="Đóng menu"
            className="menu-backdrop-react"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            onClick={() => setMobile(false)}
          />
        )}
      </AnimatePresence>
      <div className="shell-main" inert={narrow && mobile}>
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile((v) => !v)}
            aria-label="Mở menu"
            aria-expanded={mobile}
            aria-controls="sidebar"
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>Không gian quản trị</span>
            <span>/</span>
            <strong>{current.label}</strong>
          </div>
          <div className="top-tools">
            <span className={`online-text ${ready ? '' : 'muted'}`}>
              <i className="dot" />
              {ready ? 'Hệ thống trực tuyến' : 'Đang kết nối'}
            </span>
            <span className="divider" />
            <button className="icon-btn" onClick={changed} aria-label="Làm mới">
              <Icon name="refresh" />
            </button>
            <ThemePicker />
          </div>
        </header>
        <main className="content" id="content">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
          >
            <Outlet context={status} />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
