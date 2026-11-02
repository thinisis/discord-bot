import type { ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
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
  date,
  duration,
} from '../components/UI';
import { useResource } from '../services/useResource';
import { type Guild, type Logs, type Status, changed } from '../services/api';
type StatusResource = {
  data: Status | undefined;
  error: string;
  loading: boolean;
  reload: () => void;
};
export const useStatus = () => useOutletContext<StatusResource>();
function Stat({
  label,
  value,
  unit,
  note,
  icon,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note: string;
  icon: string;
  index?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      className="stat"
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.035, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="upper">{label}</div>
      <span className="stat-icon">
        <Icon name={icon} />
      </span>
      <div className="stat-value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      <div className="stat-note">{note}</div>
    </motion.article>
  );
}
export { Stat };
export function Dashboard() {
  const status = useStatus(),
    guilds = useResource<Guild[]>('/guilds'),
    logs = useResource<Logs>('/logs?source=guild&page=1', 15000);
  const s = status.data;
  if (!s)
    return status.error ? (
      <ErrorNotice message={status.error} retry={status.reload} />
    ) : (
      <PageSkeleton />
    );
  return (
    <>
      <Heading
        title="Tổng quan hệ thống"
        description="Theo dõi bot, máy chủ và hoạt động trong thời gian thực."
        action={<Refresh onClick={changed} />}
      />
      {status.error && <ErrorNotice message={status.error} />}
      <section className="stats" aria-label="Thống kê">
        <Stat
          label="Máy chủ Discord"
          value={s.guildCount}
          note={s.bot.ready ? 'Bot đã kết nối' : 'Đang chờ kết nối'}
          icon="server"
        />
        <Stat
          index={1}
          label="Gateway latency"
          value={s.bot.pingMs ?? '—'}
          unit="ms"
          note="Độ trễ kết nối Discord"
          icon="pulse"
        />
        <Stat
          index={2}
          label="Bài đang phát"
          value={s.music.activeTracks || 0}
          note={`${s.music.queuedTracks || 0} bài đang chờ phát`}
          icon="music"
        />
        <Stat
          index={3}
          label="Sự kiện ghi nhận"
          value={s.logCount}
          note={`${s.scheduleCount} lịch gửi đang bật`}
          icon="logs"
        />
      </section>
      <div className="grid">
        <Panel
          title="Máy chủ của bạn"
          description="Cấu hình và trạng thái hoạt động"
          extra={
            <Link className="inline-link" to="/guilds">
              Quản lý <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {guilds.error ? (
            <ErrorNotice message={guilds.error} />
          ) : guilds.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Máy chủ</th>
                    <th>Trạng thái</th>
                    <th>Sự kiện</th>
                  </tr>
                </thead>
                <tbody>
                  {guilds.data.slice(0, 5).map((g) => (
                    <tr key={g.guildId}>
                      <td>
                        <div className="guild-name">
                          <div className="guild-avatar">
                            {g.guildName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            {g.guildName}
                            <div className="mono muted small">{g.guildId}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge ok={g.botEnabled} neutral={!g.botEnabled}>
                          {g.botEnabled ? 'Đang bật' : 'Đã tắt'}
                        </Badge>
                      </td>
                      <td className="mono">{g.logCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : guilds.loading ? (
            <PageSkeleton />
          ) : (
            <EmptyState title="Chưa có máy chủ" description="Mời bot vào Discord để bắt đầu." />
          )}
          <div className="panel-footer">
            <span>{guilds.data?.length || 0} máy chủ được quản lý</span>
            <span>Tự động đồng bộ</span>
          </div>
        </Panel>
        <Panel
          title="Trạng thái dịch vụ"
          description="Các kết nối đang vận hành"
          extra={<Icon name="pulse" />}
        >
          <div className="panel-body">
            <Service
              icon="bot"
              title="Discord Gateway"
              description={s.bot.currentUserTag || 'Đang kết nối'}
              ready={s.bot.ready}
            />
            <Service
              icon="music"
              title="Lavalink"
              description={
                s.music.nodeVersion ? `Phiên bản ${s.music.nodeVersion}` : 'Music playback'
              }
              ready={s.music.connected}
            />
            <Service icon="server" title="PostgreSQL" description="Dữ liệu và lịch gửi" ready />
          </div>
          <div className="panel-footer">
            <span>Thời gian hoạt động</span>
            <span>{duration(s.uptimeSeconds)}</span>
          </div>
        </Panel>
        <Panel
          title="Hoạt động gần đây"
          description="Những sự kiện mới nhất từ Discord"
          extra={
            <Link className="inline-link" to="/logs">
              Xem tất cả <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {logs.error ? (
            <ErrorNotice message={logs.error} />
          ) : logs.data?.items.length ? (
            logs.data.items.slice(0, 5).map((l) => (
              <div className="log-row" key={l.id}>
                <div className="log-marker">
                  <Icon name={l.action?.startsWith('VOICE') ? 'music' : 'logs'} size={14} />
                </div>
                <div>
                  <div className="log-text">{l.message}</div>
                  <div className="log-meta">
                    <span>{l.guildName}</span>
                    <span>·</span>
                    <span>{date(l.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Chưa có hoạt động"
              description="Sự kiện Discord sẽ xuất hiện tại đây."
            />
          )}
        </Panel>
        <Panel
          title="Thông tin vận hành"
          description="Tài nguyên ứng dụng hiện tại"
          extra={<Icon name="code" />}
        >
          <dl className="panel-body">
            <Detail label="Runtime" value={s.runtime} />
            <Detail label="Bộ nhớ sử dụng" value={`${s.memoryMB.toFixed(1)} MB`} />
            <Detail label="Goroutines" value={s.goroutines} />
            <Detail label="Bắt đầu lúc" value={date(s.startedAt)} />
            <Detail label="Múi giờ hiển thị" value="GMT+7" />
          </dl>
        </Panel>
      </div>
      <Footer />
    </>
  );
}
function Service({
  icon,
  title,
  description,
  ready,
}: {
  icon: string;
  title: string;
  description: string;
  ready: boolean;
}) {
  return (
    <div className="service-row">
      <div className="service-icon">
        <Icon name={icon} />
      </div>
      <div className="spacer">
        <div className="service-title">{title}</div>
        <div className="service-sub">{description}</div>
      </div>
      <Badge ok={ready}>{ready ? 'Kết nối' : 'Chưa sẵn sàng'}</Badge>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}
