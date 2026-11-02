import { useId, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Select,
  Button,
  Input,
  Card,
  EmptyState,
  Modal,
  ToggleSwitch,
  Skeleton,
} from '@tnvn/cli-ui';
import { useUI } from '../stores/ui';
export { Select, Button, Input, Card, EmptyState, Modal, ToggleSwitch, Skeleton };
const paths: Record<string, string> = {
  bot: 'M8 7V4m8 3V4M6 8h12a2 2 0 0 1 2 2v9H4v-9a2 2 0 0 1 2-2ZM8 12h1m6 0h1M9 16h6M1 11v5m22-5v5',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  server: 'M4 3h16v7H4zM4 14h16v7H4zM7 6h.01M7 17h.01M11 6h6m-6 11h6',
  music: 'M9 18V5l12-2v13M9 7l12-2M9 18a3 3 0 1 1-3-3h3m12 1a3 3 0 1 1-3-3h3',
  logs: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3 1 3 2v4l-3 2-1 3-2 3h-4l-2-3-3-1-3-2v-4l3-2 1-3Z',
  refresh: 'M20 7a9 9 0 1 0 1 9M20 3v5h-5',
  logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h12',
  arrow: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  edit: 'm15 4 5 5M4 20l5-1L21 7l-4-4L5 15z',
  clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  pulse: 'M2 12h4l3-8 6 16 3-8h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
  shield: 'M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM9 12l2 2 4-4',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.bot} />
    </svg>
  );
}
export function Badge({
  children,
  ok,
  neutral = false,
}: {
  children: ReactNode;
  ok?: boolean;
  neutral?: boolean;
}) {
  return (
    <span className={`badge ${neutral ? '' : ok ? 'ok' : 'error'}`}>
      <i className="dot" />
      {children}
    </span>
  );
}
export const date = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(v))
    : '—';
export function duration(s = 0) {
  return s >= 86400
    ? `${Math.floor(s / 86400)} ngày ${Math.floor((s % 86400) / 3600)} giờ`
    : s >= 3600
      ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`
      : `${Math.floor(s / 60)} phút ${Math.floor(s % 60)} giây`;
}
export const trackTime = (ms = 0) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
export function ThemePicker() {
  const theme = useUI((s) => s.theme),
    setTheme = useUI((s) => s.setTheme);
  return (
    <div className="theme-picker">
      <Select
        ariaLabel="Giao diện"
        size="sm"
        value={theme}
        onChange={(v) => setTheme(v as typeof theme)}
        options={[
          { value: 'white', label: 'Trắng' },
          { value: 'dark', label: 'Đen' },
          { value: 'auto', label: 'Hệ thống' },
        ]}
      />
    </div>
  );
}
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          <i className="dot" /> CONTROL CENTER
        </div>
        <h1>{title}</h1>
        <p className="description">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Refresh({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <Icon name="refresh" />
      <span className="refresh-label">Làm mới</span>
    </Button>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <span>Discord Control / {location.hostname}</span>
      <span>Múi giờ GMT+7</span>
    </footer>
  );
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="notice error">
      <Icon name="pulse" />
      <span className="spacer">{message}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
export function PageSkeleton() {
  return (
    <div aria-label="Đang tải dữ liệu" className="stack">
      <div className="stats">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} height={132} />
        ))}
      </div>
      <Skeleton height={260} />
    </div>
  );
}
export function Panel({
  title,
  description,
  extra,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`panel-card ${className}`}
      title={
        title && (
          <div>
            <h2>{title}</h2>
            {description && <p className="small muted">{description}</p>}
          </div>
        )
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
export function Textarea({
  label,
  name,
  value,
  onChange,
  hint,
  required = false,
  maxLength,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (s: string) => void;
  hint?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        aria-describedby={hint ? id + '-hint' : undefined}
      />
      {hint && (
        <div id={id + '-hint'} className="hint">
          {hint}
        </div>
      )}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          type="button"
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          className={`tab ${value === item.value ? 'active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {value === item.value && (
            <motion.span
              className="tab-indicator"
              layoutId={id}
              transition={
                reduce ? { duration: 0 } : { type: 'spring', stiffness: 450, damping: 38 }
              }
            />
          )}
        </button>
      ))}
    </div>
  );
}
export function Toasts() {
  const toasts = useUI((s) => s.toasts),
    dismiss = useUI((s) => s.dismiss);
  const reduce = useReducedMotion();
  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast ${t.error ? 'error' : ''}`}
            initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 8 }}
            transition={{ duration: 0.18 }}
          >
            <Icon name={t.error ? 'pulse' : 'check'} />
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
              <Icon name="close" size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
