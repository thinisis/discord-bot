import { useState, type FormEvent } from 'react';
import { Button, Input, Panel, ErrorNotice, Icon } from '../components/UI';
import { save, errorMessage } from '../services/api';
import { useAuth, useUI } from '../stores/ui';

export function Account() {
  const username = useAuth((state) => state.username);
  const notify = useUI((state) => state.notify);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }
    setBusy(true);
    try {
      await save('/account/password', { currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
      notify('Đã đổi mật khẩu. Các phiên đăng nhập khác đã được đăng xuất.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Tài khoản quản trị"
      description="Thông tin đăng nhập và bảo mật tài khoản của bạn"
      extra={<Icon name="shield" />}
    >
      <form className="panel-body" onSubmit={submit}>
        <Input
          label="Tên đăng nhập"
          name="username"
          value={username || ''}
          autoComplete="username"
          readOnly
        />
        <div className="settings-heading">
          <h3>Đổi mật khẩu</h3>
          <p>Sau khi đổi mật khẩu, các phiên đăng nhập khác sẽ được đăng xuất.</p>
        </div>
        {error && <ErrorNotice message={error} />}
        {saved && (
          <div className="notice" role="status">
            <Icon name="check" />
            Đã đổi mật khẩu thành công. Bạn vẫn đang đăng nhập trên thiết bị này.
          </div>
        )}
        <Input
          label="Mật khẩu hiện tại"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={busy}
          required
        />
        <div className="form-grid">
          <Input
            label="Mật khẩu mới"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            hint="Ít nhất 8 ký tự và khác mật khẩu hiện tại."
            minLength={8}
            maxLength={72}
            disabled={busy}
            required
          />
          <Input
            label="Xác nhận mật khẩu mới"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            maxLength={72}
            disabled={busy}
            required
          />
        </div>
        <div className="form-actions">
          <Button type="submit" loading={busy}>
            <Icon name="shield" size={15} />
            Đổi mật khẩu
          </Button>
        </div>
      </form>
    </Panel>
  );
}
