import { useEffect, useState, type FormEvent } from 'react';
import {
  Badge,
  Heading,
  Refresh,
  Footer,
  Panel,
  EmptyState,
  PageSkeleton,
  ErrorNotice,
  Icon,
  Modal,
  Input,
  Button,
  Select,
  ToggleSwitch,
} from '../components/UI';
import { type Guild, type Channel, save, changed, errorMessage } from '../services/api';
import { useResource } from '../services/useResource';
import { useUI } from '../stores/ui';
export function Guilds() {
  const resource = useResource<Guild[]>('/guilds'),
    [selected, setSelected] = useState<Guild | null>(null);
  return (
    <>
      <Heading
        title="Máy chủ Discord"
        description="Quản lý hoạt động, kênh ghi log và âm lượng của từng máy chủ."
        action={<Refresh onClick={resource.reload} />}
      />
      <div className="notice">
        <Icon name="shield" />
        Cấu hình được áp dụng trực tiếp. Tắt bot sẽ dừng phát nhạc tại máy chủ đó.
      </div>
      {resource.error && <ErrorNotice message={resource.error} retry={resource.reload} />}
      <Panel title="Tất cả máy chủ" extra={<Badge neutral>{resource.data?.length || 0}</Badge>}>
        {resource.loading ? (
          <PageSkeleton />
        ) : resource.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Máy chủ</th>
                  <th>Trạng thái</th>
                  <th>Kênh ghi log</th>
                  <th>Âm lượng</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resource.data.map((g) => (
                  <tr key={g.guildId}>
                    <td>
                      <div className="guild-name">
                        <div className="guild-avatar">{g.guildName.slice(0, 2).toUpperCase()}</div>
                        <div>
                          <strong>{g.guildName}</strong>
                          <div className="mono muted">{g.guildId}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge ok={g.botEnabled} neutral={!g.botEnabled}>
                        {g.botEnabled ? 'Đang bật' : 'Đã tắt'}
                      </Badge>
                    </td>
                    <td className="mono sub">{g.logChannelId || 'Chưa cấu hình'}</td>
                    <td className="mono">{g.musicVolume}%</td>
                    <td>
                      <Button variant="secondary" size="sm" onClick={() => setSelected(g)}>
                        <Icon name="edit" size={14} />
                        Cấu hình
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Chưa có máy chủ"
            description="Bot sẽ đồng bộ sau khi được mời vào Discord."
          />
        )}
      </Panel>
      <GuildModal guild={selected} onClose={() => setSelected(null)} />
      <Footer />
    </>
  );
}
function GuildModal({ guild, onClose }: { guild: Guild | null; onClose: () => void }) {
  return (
    <Modal open={!!guild} title={guild ? `Cấu hình · ${guild.guildName}` : ''} onClose={onClose}>
      {guild && <GuildForm key={guild.guildId} guild={guild} onClose={onClose} />}
    </Modal>
  );
}
function GuildForm({ guild, onClose }: { guild: Guild; onClose: () => void }) {
  const [enabled, setEnabled] = useState(guild.botEnabled),
    [channel, setChannel] = useState(guild.logChannelId || ''),
    [volume, setVolume] = useState(guild.musicVolume),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const channels = useResource<Channel[]>('/channels/' + guild.guildId),
    notify = useUI((s) => s.notify);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await save('/guilds/' + guild.guildId, {
        botEnabled: enabled,
        logChannelId: channel,
        musicVolume: volume,
      });
      changed();
      notify('Đã lưu cấu hình máy chủ.');
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
      <div className="form-group toggle-field">
        <ToggleSwitch checked={enabled} onChange={setEnabled} label="Bật bot tại máy chủ này" />
      </div>
      <div className="form-group">
        <label id="guild-log-label">Kênh ghi log</label>
        <Select
          value={channel}
          onChange={setChannel}
          ariaLabelledBy="guild-log-label"
          disabled={channels.loading || !!channels.error}
          options={[
            { value: '', label: 'Không gửi log vào Discord' },
            ...(channels.data || [])
              .filter((c) => [0, 5].includes(c.type))
              .map((c) => ({ value: c.id, label: '#' + c.name })),
          ]}
        />
        {channels.error && <div className="error-text">{channels.error}</div>}
      </div>
      <Input
        label="Âm lượng mặc định (%)"
        name="musicVolume"
        type="number"
        min={0}
        max={200}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        required
      />
      <div className="form-actions">
        <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" loading={busy}>
          Lưu cấu hình
        </Button>
      </div>
    </form>
  );
}
