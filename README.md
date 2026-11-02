# Discord Control — Go

English | [Tiếng Việt](README.vi.md)

A self-hosted Discord management application. The backend, bot, Lavalink integration, and scheduler are written in Go. The frontend uses React 19, TypeScript, Vite, Motion, and Zustand, matching the CLI Proxy API stack. Buttons, inputs, selects, modals, toggles, cards, skeletons, and theme tokens are shared from the CLI through the `frontend/shared/cli-ui` workspace, with scripts to synchronize and verify the snapshot. The frontend build is embedded in the Go binary. The interface supports animated navigation, reduced motion, three theme modes, and mobile screens.

Node.js, Next.js, Prisma, and Redis are not required at runtime. PostgreSQL stores application data, and Lavalink provides audio playback as a separate Java service.

## Features

- Admin authentication with bcrypt, HMAC-signed sessions, HttpOnly/SameSite cookies, origin checks, and login rate limiting.
- Password changes under Settings → Account, with the current password required and other sessions revoked.
- A dashboard showing Discord and Lavalink status, memory, uptime, and live data.
- Per-guild bot controls, log mirror channels, and volume from 0–200%.
- Searchable, paginated audit logs for channel changes and voice joins, leaves, and moves.
- 12 slash commands: help, ping, play, search, pause, resume, skip, join, summon, leave, queue, and volume.
- YouTube playback, playlists, and search through Lavalink, with track selection, player controls, and a paginated queue.
- A public homepage and YouTube account linking under Settings → YouTube.
- Per-command access for everyone or the owner; player controls require the user to be in the same voice channel.
- Presence based on the current track or a GMT+7 schedule.
- One-time, daily, and weekly messages stored in PostgreSQL, polled every 15 seconds using `FOR UPDATE SKIP LOCKED`, with a five-minute retry after failures.
- Automatic Lavalink reconnection and session resume; automatic playback stops after three consecutive failures while keeping the remaining queue.

## Deployment

Docker and Docker Compose are required. See [deploy/README.md](deploy/README.md) for details.

```sh
cp .env.example .env
# Fill in .env, including the bootstrap admin credentials for a new database.
docker compose --env-file .env -f deploy/compose.yml up -d --build
```

The panel binds to `127.0.0.1:3817`. Configure an HTTPS reverse proxy to forward requests to this port.

New databases are initialized from the SQL files embedded in `migrations/`. Existing databases from the Node version retain their tables, accounts, bcrypt hashes, HMAC sessions, guild settings, command policies, schedules, and logs. Keep `SESSION_SECRET` unchanged to preserve sessions and decrypt the linked YouTube credentials.

## Development

Use Go 1.26, Bun 1.3.14, and Node.js 22.12+ for the frontend build. Docker handles these build dependencies automatically.

```sh
cd frontend
bun install --frozen-lockfile
bun run verify
cd ..
go test -race ./...
go vet ./...
go build -trimpath -o discord-control ./cmd/server
```

The binary reads configuration from environment variables. Static assets and migrations are embedded with `go:embed`. Docker builds the frontend with Vite before compiling Go; the production container does not include a Node.js or Bun runtime. See [frontend/README.md](frontend/README.md) and [frontend/shared/cli-ui/README.md](frontend/shared/cli-ui/README.md).

`APP_MODE=all|web|bot` controls which components run. Management APIs require authentication; `/api/healthz` returns only basic status without guild or voice information.

## Operational notes

- The application reads the Node version's `runtime/system.log.jsonl` and `runtime/go-system.log.jsonl` for log history. Keep the runtime volume when upgrading.
- The music queue is stored in memory and is cleared when the application restarts. Lavalink can resume a session when only its WebSocket connection is interrupted.
- Some YouTube videos require authentication. Link a Google account under Settings → YouTube using the device code. Google requests permission to manage YouTube, so consider using a separate account. OAuth does not guarantee playback of every video.
- Lavalink must enable the youtube-source `TV` client and set `logging.request.enabled: false` to prevent refresh tokens from appearing in logs. Tokens are encrypted in PostgreSQL; protect `SESSION_SECRET` and database backups.
- Compose runs yt-cipher internally to decipher YouTube audio URLs. The configuration pins a youtube-source snapshot containing the TV client fix and a tested yt-cipher image; monitor upstream updates as YouTube changes.
- Scheduled messages use PostgreSQL and do not require Upstash. Sending a Discord message and recording its database status cannot be one atomic transaction: a process crash after Discord receives a message but before the database commits may cause a duplicate. Row locking prevents two workers from sending concurrently under normal conditions.
