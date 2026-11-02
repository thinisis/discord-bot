import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, ErrorNotice, Icon, Modal, Panel, Skeleton } from '../components/UI';
import { api, errorMessage } from '../services/api';
import { useUI } from '../stores/ui';
import './YoutubeOAuth.scss';

type OAuthState = {
  state: 'idle' | 'pending' | 'connected' | 'saved' | 'expired' | 'denied';
  connected: boolean;
  applied: boolean;
  verificationUrl?: string;
  userCode?: string;
  expiresAt?: string;
  interval?: number;
};
const endpoint = '/integrations/youtube/oauth';

export function YoutubeOAuth() {
  const [state, setState] = useState<OAuthState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const notify = useUI((value) => value.notify);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<OAuthState>(endpoint, { signal: controller.signal })
      .then(setState)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, []);

  const poll = useCallback(async () => {
    try {
      const result = await api<OAuthState>(endpoint + '/poll', { method: 'POST' });
      if (!mounted.current) return;
      setState(result);
      setError('');
      if (result.state === 'connected') notify('YouTube đã được kết nối.');
      if (result.state === 'denied') setError('Bạn đã từ chối cấp quyền. Bạn có thể thử lại.');
      if (result.state === 'expired') setError('Mã xác thực đã hết hạn. Hãy tạo mã mới.');
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    }
  }, [notify]);

  useEffect(() => {
    if (state?.state !== 'pending' || error) return;
    const timer = window.setTimeout(() => void poll(), Math.max(5, state.interval || 5) * 1000);
    return () => window.clearTimeout(timer);
  }, [state, error, poll]);

  async function action(path: string, method: 'POST' | 'DELETE', message?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<OAuthState>(endpoint + path, { method });
      if (!mounted.current) return;
      setState(result);
      if (message) notify(message);
      if (path === '' && method === 'DELETE') setDisconnectOpen(false);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const connected = Boolean(state?.connected && state.applied);
  return (
    <Panel
      title="Kết nối YouTube"
      description="Xác thực tài khoản để Lavalink truy cập nguồn nhạc YouTube"
      extra={
        <Badge ok={connected} neutral={!state?.connected}>
          {connected ? 'Đã kết nối' : state?.connected ? 'Chờ kết nối' : 'Chưa kết nối'}
        </Badge>
      }
    >
      <div className="panel-body youtube-oauth">
        {!state && !error ? (
          <Skeleton height={150} />
        ) : (
          <>
            {error && <ErrorNotice message={error} />}
            <div className="youtube-oauth-intro">
              <div className="service-icon">
                <Icon name="music" />
              </div>
              <div>
                <h3>Phát nhạc từ YouTube</h3>
                <p>
                  Liên kết bằng mã thiết bị. Bot chỉ lưu thông tin xác thực ở máy chủ; mật khẩu
                  Google của bạn không được nhập vào đây.
                </p>
              </div>
            </div>
            <div className="notice youtube-oauth-note">
              <Icon name="shield" />
              <span>
                Google sẽ yêu cầu quyền quản lý tài khoản YouTube. Nên dùng tài khoản phụ; xác thực
                có thể không giải quyết mọi giới hạn phát của YouTube.
              </span>
            </div>
            {state?.state === 'pending' && state.userCode && state.verificationUrl ? (
              <div className="youtube-oauth-device">
                <div className="upper">MÃ XÁC THỰC</div>
                <div className="youtube-oauth-code">{state.userCode}</div>
                <p>
                  Mở trang Google, đăng nhập tài khoản bạn muốn dùng và nhập mã này. Trang sẽ tự
                  kiểm tra sau khi bạn cấp quyền.
                </p>
                {state.expiresAt && (
                  <div className="small muted">
                    Mã hết hạn lúc{' '}
                    {new Intl.DateTimeFormat('vi-VN', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }).format(new Date(state.expiresAt))}{' '}
                    (GMT+7).
                  </div>
                )}
                <div className="youtube-oauth-actions">
                  <a
                    className="btn btn-primary youtube-oauth-link"
                    href={state.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Mở trang xác thực Google ↗
                  </a>
                  <Button variant="secondary" onClick={() => void poll()} disabled={busy}>
                    Tôi đã xác thực
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void action('/pending', 'DELETE')}
                    disabled={busy}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : state?.connected ? (
              <div className="youtube-oauth-connected">
                <div>
                  <strong>
                    {connected ? 'Tài khoản đã được liên kết' : 'Đã lưu xác thực, chờ Lavalink'}
                  </strong>
                  <p>
                    {connected
                      ? 'Lavalink sẽ sử dụng tài khoản này cho các nguồn YouTube hỗ trợ OAuth.'
                      : 'Lavalink chưa nhận được thông tin xác thực. Thử kết nối lại khi dịch vụ sẵn sàng.'}
                  </p>
                </div>
                <div className="youtube-oauth-actions">
                  {!connected && (
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={() => void action('/apply', 'POST')}
                    >
                      Kết nối lại
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void action('/start', 'POST')}
                  >
                    Liên kết tài khoản khác
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => setDisconnectOpen(true)}>
                    Ngắt kết nối
                  </Button>
                </div>
              </div>
            ) : (
              <div className="youtube-oauth-actions">
                <Button loading={busy} onClick={() => void action('/start', 'POST')}>
                  <Icon name="plus" size={15} />
                  Liên kết YouTube
                </Button>
                {error && (
                  <Button
                    variant="secondary"
                    onClick={() => void action('/start', 'POST')}
                    disabled={busy}
                  >
                    Thử lại
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <Modal
        open={disconnectOpen}
        title="Ngắt kết nối YouTube"
        onClose={() => {
          if (!busy) setDisconnectOpen(false);
        }}
        closeDisabled={busy}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDisconnectOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void action('', 'DELETE', 'Đã ngắt kết nối YouTube trong bot.')}
            >
              Ngắt kết nối
            </Button>
          </>
        }
      >
        <p>
          Bot sẽ xóa thông tin xác thực đã lưu và ngừng dùng tài khoản YouTube này. Bạn có thể liên
          kết lại bất cứ lúc nào.
        </p>
      </Modal>
    </Panel>
  );
}
