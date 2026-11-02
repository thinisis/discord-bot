import { useState, type FormEvent } from 'react';
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
  date,
} from '../components/UI';
import { useResource } from '../services/useResource';
import type { Logs as LogData } from '../services/api';
const actions = [
  'CHANNEL_CREATE',
  'CHANNEL_UPDATE',
  'CHANNEL_DELETE',
  'VOICE_JOIN',
  'VOICE_LEAVE',
  'VOICE_MOVE',
];
export function Logs() {
  const [source, setSource] = useState('guild'),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [guild, setGuild] = useState(''),
    [action, setAction] = useState(''),
    [level, setLevel] = useState(''),
    [filter, setFilter] = useState({ q: '', guildId: '', action: '', level: '' });
  const params = new URLSearchParams({ source, page: String(page), ...filter });
  const resource = useResource<LogData>('/logs?' + params),
    data = resource.data;
  function submit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setFilter({ q: query, guildId: guild, action, level });
  }
  const system = source === 'system';
  return (
    <>
      <Heading
        title="Nhật ký hệ thống"
        description="Tra cứu hoạt động Discord và sự kiện vận hành. Thời gian GMT+7."
        action={<Refresh onClick={resource.reload} />}
      />
      <Tabs
        value={source}
        onChange={(v) => {
          setSource(v);
          setPage(1);
          setFilter({ q: query, guildId: '', action: '', level: '' });
        }}
        items={[
          { value: 'guild', label: 'Hoạt động Discord' },
          { value: 'system', label: 'Nhật ký ứng dụng' },
        ]}
      />
      <form onSubmit={submit} className="toolbar">
        <div className="search-field">
          <Input
            name="q"
            aria-label="Tìm nhật ký"
            placeholder="Tìm trong nội dung nhật ký…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rightElement={<Icon name="search" size={15} />}
          />
        </div>
        {system ? (
          <div className="filter-select">
            <Select
              value={level}
              onChange={setLevel}
              ariaLabel="Mức độ"
              options={[
                { value: '', label: 'Tất cả mức độ' },
                ...['info', 'warn', 'error'].map((v) => ({ value: v, label: v })),
              ]}
            />
          </div>
        ) : (
          <>
            <div className="filter-id">
              <Input
                name="guildId"
                aria-label="Guild ID"
                placeholder="Guild ID"
                value={guild}
                onChange={(e) => setGuild(e.target.value)}
              />
            </div>
            <div className="filter-select">
              <Select
                value={action}
                onChange={setAction}
                ariaLabel="Loại sự kiện"
                options={[
                  { value: '', label: 'Tất cả sự kiện' },
                  ...actions.map((v) => ({ value: v, label: v })),
                ]}
              />
            </div>
          </>
        )}
        <Button variant="secondary" type="submit">
          <Icon name="search" size={15} />
          Lọc
        </Button>
      </form>
      {resource.error && <ErrorNotice message={resource.error} retry={resource.reload} />}
      <Panel>
        {resource.loading && !data ? (
          <PageSkeleton />
        ) : data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>{system ? 'Mức độ' : 'Sự kiện'}</th>
                  {!system && <th>Máy chủ</th>}
                  <th>Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td className="time">{date(l.createdAt)}</td>
                    <td>
                      <Badge neutral={!system || l.level === 'info'} ok={l.level !== 'error'}>
                        {system ? l.level : l.action}
                      </Badge>
                    </td>
                    {!system && <td>{l.guildName}</td>}
                    <td className="message">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Không tìm thấy nhật ký"
            description="Thử thay đổi bộ lọc hoặc chờ sự kiện mới."
          />
        )}
        <div className="panel-footer">
          <span>
            {data?.total || 0} kết quả · Trang {page}/
            {Math.max(1, Math.ceil((data?.total || 0) / 30))}
          </span>
          <div className="pager">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || resource.loading}
              onClick={() => setPage((v) => v - 1)}
            >
              Trước
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page * 30 >= (data?.total || 0) || resource.loading}
              onClick={() => setPage((v) => v + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      </Panel>
      <Footer />
    </>
  );
}
