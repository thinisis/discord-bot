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
  trackTime,
} from '../components/UI';
import { useStatus, Stat } from './Dashboard';
export function Music() {
  const resource = useStatus(),
    s = resource.data;
  if (!s)
    return resource.error ? (
      <ErrorNotice message={resource.error} retry={resource.reload} />
    ) : (
      <PageSkeleton />
    );
  const m = s.music;
  return (
    <>
      <Heading
        title="Âm nhạc"
        description="Theo dõi player, kết nối voice và các bài đang phát."
        action={<Refresh onClick={resource.reload} />}
      />
      <section className="stats">
        <Stat
          label="Player hoạt động"
          value={m.sessions.length}
          note="Các phiên voice hiện tại"
          icon="music"
        />
        <Stat
          index={1}
          label="Bài đang phát"
          value={m.activeTracks || 0}
          note={m.connected ? 'Lavalink đã kết nối' : 'Chờ Lavalink'}
          icon="pulse"
        />
        <Stat
          index={2}
          label="Trong hàng chờ"
          value={m.queuedTracks || 0}
          unit="bài"
          note="Tổng các máy chủ"
          icon="logs"
        />
        <Stat
          index={3}
          label="Lavalink"
          value={m.nodeVersion || '—'}
          note={`${m.sources?.length || 0} nguồn âm thanh`}
          icon="server"
        />
      </section>
      {(m.lastError || resource.error) && <ErrorNotice message={m.lastError || resource.error} />}
      <div className="player-grid">
        {m.sessions.length ? (
          m.sessions.map((p) => (
            <Panel
              key={p.guildId}
              title={`Guild ${p.guildId}`}
              extra={<Badge ok={p.connected}>{p.connected ? 'Voice kết nối' : 'Chờ voice'}</Badge>}
            >
              <div className="now-playing">
                {p.currentTrack?.info.artworkUrl ? (
                  <img
                    className="album"
                    src={p.currentTrack.info.artworkUrl}
                    alt="Ảnh bìa bài hát"
                  />
                ) : (
                  <div className="album service-icon">
                    <Icon name="music" />
                  </div>
                )}
                <div className="spacer">
                  <div className="upper">
                    {p.paused ? 'Đã tạm dừng' : p.currentTrack ? 'Đang phát' : 'Sẵn sàng'}
                  </div>
                  <div className="track-title">
                    {p.currentTrack?.info.title || 'Chưa có bài hát'}
                  </div>
                  <div className="small sub">
                    {p.currentTrack?.info.author || 'Dùng /play trong Discord để phát nhạc.'}
                  </div>
                  {p.currentTrack && (
                    <>
                      <progress
                        className="progress"
                        max={p.currentTrack.info.length || 1}
                        value={p.positionMs || 0}
                        aria-label="Tiến trình bài hát"
                      />
                      <div className="row between small muted">
                        <span>{trackTime(p.positionMs)}</span>
                        <span>{trackTime(p.currentTrack.info.length)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="panel-footer">
                <span>Âm lượng {p.volume}%</span>
                <span>{p.queueLength} bài trong queue</span>
              </div>
            </Panel>
          ))
        ) : (
          <Panel className="wide">
            <EmptyState
              title="Chưa có phiên phát nhạc"
              description="Vào voice channel và dùng /play hoặc /search trong Discord."
            />
          </Panel>
        )}
      </div>
      <Panel title="Nguồn và plugin" className="mt22">
        <div className="panel-body row wrap">
          {(m.sources || []).map((source) => (
            <Badge key={source} neutral>
              {source}
            </Badge>
          ))}
          {(m.plugins || []).map((plugin) => (
            <Badge key={plugin} ok>
              {plugin}
            </Badge>
          ))}
        </div>
      </Panel>
      <Footer />
    </>
  );
}
