import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Account } from './Account';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Heading,
  Refresh,
  Footer,
  Panel,
  EmptyState,
  PageSkeleton,
  ErrorNotice,
  Icon,
  Badge,
  Input,
  Button,
  Select,
  Tabs,
  Modal,
  Textarea,
  ToggleSwitch,
  date,
} from '../components/UI';
import { useResource } from '../services/useResource';
import {
  api,
  save,
  changed,
  errorMessage,
  type Settings as SettingsData,
  type SystemConfig,
  type Guild,
  type Schedule,
  type Channel,
} from '../services/api';
import { useUI } from '../stores/ui';
export function Settings() {
  const resource = useResource<SettingsData>('/settings'),
    guilds = useResource<Guild[]>('/guilds');
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') || 'system';
  const tab = ['system', 'policies', 'schedules', 'account'].includes(requestedTab)
    ? requestedTab
    : 'system';
  const setTab = (value: string) => setParams(value === 'system' ? {} : { tab: value });
  const reduce = useReducedMotion();
  return (
    <>
      <Heading
        title="Cài đặt"
        description="Quản lý hành vi bot, phân quyền và tự động hóa."
        action={<Refresh onClick={resource.reload} />}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'system', label: 'Cấu hình chung' },
          { value: 'policies', label: 'Quyền lệnh' },
          { value: 'schedules', label: 'Lịch gửi tin nhắn' },
          { value: 'account', label: 'Tài khoản' },
        ]}
      />
      {resource.error && <ErrorNotice message={resource.error} retry={resource.reload} />}
      <div className="settings-layout">
        {!resource.data ? (
          <PageSkeleton />
        ) : (
          <AnimatePresence initial={false} mode="wait">
            <motion.section
              key={tab}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -3 }}
              transition={{ duration: reduce ? 0.05 : 0.14 }}
            >
              {tab === 'system' ? (
                <SystemForm config={resource.data.system} />
              ) : tab === 'policies' ? (
                <Policies data={resource.data} />
              ) : tab === 'account' ? (
                <Account />
              ) : (
                <Schedules schedules={resource.data.schedules} guilds={guilds.data || []} />
              )}
            </motion.section>
          </AnimatePresence>
        )}
      </div>
      <Footer />
    </>
  );
}
function SystemForm({ config }: { config: SystemConfig }) {
  const [value, setValue] = useState({ ...config }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    notify = useUI((s) => s.notify);
  const update = <K extends keyof SystemConfig>(key: K, v: SystemConfig[K]) =>
    setValue((s) => ({ ...s, [key]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const {
        ownerDiscordIds,
        queuePageSize,
        idleMorningText,
        idleNoonText,
        idleEveningText,
        idleNightText,
      } = value;
      await save('/settings', {
        ownerDiscordIds,
        queuePageSize,
        idleMorningText,
        idleNoonText,
        idleEveningText,
        idleNightText,
      });
      changed();
      notify('Đã lưu cấu hình hệ thống.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Cấu hình hệ thống"
      description="Thiết lập người sở hữu và hoạt động mặc định"
      extra={<Icon name="settings" />}
    >
      <form className="panel-body" onSubmit={submit}>
        {error && <ErrorNotice message={error} />}
        <div className="form-grid">
          <div className="full">
            <Textarea
              label="Owner Discord IDs"
              name="ownerDiscordIds"
              value={value.ownerDiscordIds}
              onChange={(v) => update('ownerDiscordIds', v)}
              hint="Mỗi ID một dòng. Các tài khoản này được phép chạy lệnh dành riêng cho owner."
              required
            />
          </div>
          <Input
            label="Số bài mỗi trang queue"
            name="queuePageSize"
            type="number"
            min={5}
            max={25}
            value={value.queuePageSize}
            onChange={(e) => update('queuePageSize', Number(e.target.value))}
            required
          />
          <div />
          <div className="settings-heading full">
            <h3>Trạng thái khi không phát nhạc</h3>
            <p>Bot tự thay đổi theo khung giờ GMT+7.</p>
          </div>
          {(
            [
              ['idleMorningText', 'Buổi sáng · 05:00–10:59'],
              ['idleNoonText', 'Buổi trưa · 11:00–16:59'],
              ['idleEveningText', 'Buổi tối · 17:00–21:59'],
              ['idleNightText', 'Ban đêm · 22:00–04:59'],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              name={key}
              value={value[key]}
              onChange={(e) => update(key, e.target.value)}
              maxLength={120}
              required
            />
          ))}
        </div>
        <div className="form-actions">
          <span className="small muted spacer">Thay đổi được áp dụng tự động.</span>
          <Button loading={busy} type="submit">
            <Icon name="check" size={15} />
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </Panel>
  );
}
function Policies({ data }: { data: SettingsData }) {
  const [value, setValue] = useState<Record<string, string>>(
      Object.fromEntries(data.policies.map((p) => [p.commandName, p.accessLevel]))
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    notify = useUI((s) => s.notify);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await save('/policies', value);
      changed();
      notify('Đã cập nhật quyền thực thi lệnh.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="settings-heading">
        <h2>Quyền thực thi slash command</h2>
        <p>Giới hạn từng lệnh cho owner hoặc cho phép mọi thành viên sử dụng.</p>
      </div>
      <Panel>
        <form onSubmit={submit} id="policies-form">
          {error && <ErrorNotice message={error} />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lệnh Discord</th>
                  <th>Quyền truy cập</th>
                </tr>
              </thead>
              <tbody>
                {data.commands.map((name) => (
                  <tr key={name}>
                    <td className="mono">/{name}</td>
                    <td>
                      <div className="policy-select">
                        <Select
                          ariaLabel={'Quyền lệnh ' + name}
                          value={value[name] || 'EVERYONE'}
                          onChange={(level) => setValue((v) => ({ ...v, [name]: level }))}
                          options={[
                            { value: 'EVERYONE', label: 'Mọi thành viên' },
                            { value: 'OWNER', label: 'Chỉ owner' },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-body">
            <div className="form-actions">
              <Button loading={busy} type="submit">
                <Icon name="check" size={15} />
                Lưu phân quyền
              </Button>
            </div>
          </div>
        </form>
      </Panel>
    </>
  );
}
function Schedules({ schedules, guilds }: { schedules: Schedule[]; guilds: Guild[] }) {
  const [editing, setEditing] = useState<Schedule | null>(null),
    [deleting, setDeleting] = useState<Schedule | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notify = useUI((s) => s.notify);
  function create() {
    setEditing({
      name: '',
      guildId: guilds[0]?.guildId || '',
      channelId: '',
      message: '',
      frequency: 'DAILY',
      daysOfWeek: null,
      hour: 8,
      minute: 0,
      runAt: null,
      enabled: true,
    });
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await api('/schedules/' + deleting.id, { method: 'DELETE' });
      setDeleting(null);
      changed();
      notify('Đã xóa lịch gửi.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="row between settings-heading">
        <div>
          <h2>Lịch gửi tin nhắn</h2>
          <p>Tự động gửi theo giờ Việt Nam, hàng ngày, hàng tuần hoặc một lần.</p>
        </div>
        <Button onClick={create} disabled={!guilds.length}>
          <Icon name="plus" size={15} />
          Tạo lịch
        </Button>
      </div>
      <Panel>
        {schedules.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lịch gửi</th>
                  <th>Tần suất</th>
                  <th>Lần tiếp theo</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <div className="small muted mono">{s.channelId}</div>
                    </td>
                    <td>
                      {{ DAILY: 'Hàng ngày', WEEKLY: 'Hàng tuần', ONCE: 'Một lần' }[s.frequency]}
                    </td>
                    <td className="time">{date(s.nextRunAt)}</td>
                    <td>
                      <Badge ok={s.enabled} neutral={!s.enabled}>
                        {s.enabled ? 'Đang bật' : 'Đã tắt'}
                      </Badge>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="icon-btn"
                          onClick={() => setEditing(s)}
                          aria-label={'Sửa ' + s.name}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            setDeleting(s);
                            setError('');
                          }}
                          aria-label={'Xóa ' + s.name}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Chưa có lịch gửi"
            description="Tạo lịch đầu tiên để tự động gửi thông báo cho cộng đồng."
          />
        )}
      </Panel>
      <Modal
        open={!!editing}
        title={editing?.id ? 'Chỉnh sửa lịch gửi' : 'Tạo lịch gửi mới'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ScheduleForm
            key={editing.id || 'new'}
            initial={editing}
            guilds={guilds}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        open={!!deleting}
        title="Xóa lịch gửi"
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        closeDisabled={busy}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
              Hủy
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Xóa lịch
            </Button>
          </>
        }
      >
        {error && <ErrorNotice message={error} />}
        <p>
          Bạn muốn xóa lịch gửi <strong>{deleting?.name}</strong>? Thao tác sẽ ngừng các lần gửi
          tiếp theo.
        </p>
      </Modal>
    </>
  );
}
function ScheduleForm({
  initial,
  guilds,
  onClose,
}: {
  initial: Schedule;
  guilds: Guild[];
  onClose: () => void;
}) {
  const [value, setValue] = useState({ ...initial }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const channels = useResource<Channel[]>('/channels/' + value.guildId),
    notify = useUI((s) => s.notify);
  const update = <K extends keyof Schedule>(key: K, v: Schedule[K]) =>
    setValue((s) => ({ ...s, [key]: v }));
  const local = value.runAt
    ? new Date(new Date(value.runAt).getTime() + 7 * 3600000).toISOString().slice(0, 16)
    : '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.channelId) {
      setError('Vui lòng chọn kênh gửi tin.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: value.name,
        guildId: value.guildId,
        channelId: value.channelId,
        message: value.message,
        frequency: value.frequency,
        daysOfWeek: value.frequency === 'WEEKLY' ? value.daysOfWeek : null,
        hour: value.frequency === 'ONCE' ? null : value.hour,
        minute: value.frequency === 'ONCE' ? null : value.minute,
        runAt: value.frequency === 'ONCE' ? value.runAt : null,
        enabled: value.enabled,
      };
      await save(
        initial.id ? '/schedules/' + initial.id : '/schedules',
        payload,
        initial.id ? 'PUT' : 'POST'
      );
      changed();
      notify('Đã lưu lịch gửi.');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {error && <ErrorNotice message={error} />}
      <div className="form-grid">
        <div className="full">
          <Input
            label="Tên lịch gửi"
            name="name"
            value={value.name}
            onChange={(e) => update('name', e.target.value)}
            maxLength={160}
            required
          />
        </div>
        <div className="form-group">
          <label id="schedule-guild-label">Máy chủ</label>
          <Select
            value={value.guildId}
            ariaLabelledBy="schedule-guild-label"
            onChange={(v) => setValue((s) => ({ ...s, guildId: v, channelId: '' }))}
            options={guilds.map((g) => ({ value: g.guildId, label: g.guildName }))}
          />
        </div>
        <div className="form-group">
          <label id="schedule-channel-label">Kênh gửi tin</label>
          <Select
            value={value.channelId}
            ariaLabelledBy="schedule-channel-label"
            onChange={(v) => update('channelId', v)}
            disabled={channels.loading || !!channels.error}
            options={[
              { value: '', label: channels.loading ? 'Đang tải kênh…' : 'Chọn kênh gửi' },
              ...(channels.data || [])
                .filter((c) => [0, 5].includes(c.type))
                .map((c) => ({ value: c.id, label: '#' + c.name })),
            ]}
          />
          {channels.error && <div className="error-text">{channels.error}</div>}
        </div>
        <div className="full">
          <Textarea
            label="Nội dung tin nhắn"
            name="message"
            value={value.message}
            onChange={(v) => update('message', v)}
            maxLength={2000}
            required
          />
        </div>
        <div className="form-group full">
          <label id="schedule-frequency-label">Tần suất</label>
          <Select
            value={value.frequency}
            ariaLabelledBy="schedule-frequency-label"
            onChange={(v) => update('frequency', v as Schedule['frequency'])}
            options={[
              { value: 'DAILY', label: 'Hàng ngày' },
              { value: 'WEEKLY', label: 'Hàng tuần' },
              { value: 'ONCE', label: 'Một lần' },
            ]}
          />
        </div>
        {value.frequency !== 'ONCE' && (
          <>
            <Input
              label="Giờ (GMT+7)"
              type="number"
              name="hour"
              min={0}
              max={23}
              required
              value={value.hour ?? 8}
              onChange={(e) => update('hour', Number(e.target.value))}
            />
            <Input
              label="Phút"
              type="number"
              name="minute"
              min={0}
              max={59}
              required
              value={value.minute ?? 0}
              onChange={(e) => update('minute', Number(e.target.value))}
            />
          </>
        )}
        {value.frequency === 'WEEKLY' && (
          <div className="full">
            <Input
              label="Ngày trong tuần"
              name="daysOfWeek"
              value={value.daysOfWeek || ''}
              onChange={(e) => update('daysOfWeek', e.target.value)}
              hint="0 = Chủ nhật · 1 = Thứ hai · … · 6 = Thứ bảy"
              placeholder="1,3,5"
              required
            />
          </div>
        )}
        {value.frequency === 'ONCE' && (
          <div className="full">
            <Input
              label="Thời gian gửi (GMT+7)"
              type="datetime-local"
              name="runAt"
              value={local}
              onChange={(e) =>
                update(
                  'runAt',
                  e.target.value ? new Date(e.target.value + ':00+07:00').toISOString() : null
                )
              }
              required
            />
          </div>
        )}
        <div className="full toggle-field">
          <ToggleSwitch
            label="Bật lịch gửi"
            checked={value.enabled}
            onChange={(v) => update('enabled', v)}
          />
        </div>
      </div>
      <div className="form-actions">
        <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" loading={busy} disabled={channels.loading || !!channels.error}>
          Lưu lịch gửi
        </Button>
      </div>
    </form>
  );
}
