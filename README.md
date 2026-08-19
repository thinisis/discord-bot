# Discord Bot + Admin Panel

Hệ thống Discord bot self-hosted viết bằng Node.js/TypeScript, dùng PostgreSQL + Prisma cho dữ liệu, Next.js cho web panel, và Lavalink cho music playback.

Panel hiện tập trung vào vận hành:

- giám sát bot, Lavalink, queue và runtime status
- xem system logs từ file runtime và guild logs từ PostgreSQL
- quản lý guild settings thực tế
- bật hoặc tắt bot theo từng guild
- hiển thị toàn bộ thời gian theo GMT+7
- hỗ trợ light mode và dark mode

## Những gì vẫn được giữ

- audit logs cho kênh: tạo, cập nhật, xóa
- voice activity log: member vào, rời, chuyển voice channel
- slash commands music: `/play`, `/pause`, `/resume`, `/join`, `/summon`, `/leave`, `/queue`, `/volume`
- guild settings trong Prisma
- admin auth với local admin + signed session cookie
- web panel quản trị

## Runtime mới

Runtime không còn stream trực tiếp từ bot process bằng `play-dl`.

Thiết kế hiện tại:

- một tiến trình Node.js cho bot Discord + web panel
- một tiến trình Lavalink riêng cho playback
- một PostgreSQL database dùng chung cho auth, settings và logs

Đây là mô hình thực tế hơn cho VPS self-hosted vì phần voice/music được tách sang service chuyên dụng, dễ restart và dễ quan sát hơn.

## Yêu cầu

- Node.js 20.11+
- Java 17+ cho Lavalink
- PostgreSQL

## Quick Start

```bash
cp .env.example .env
cp infra/lavalink/application.yml.example infra/lavalink/application.yml
npm install
npm run db:migrate
npm run admin:bootstrap -- --username admin --password "replace-this-password"
npm run build
```

Khởi động Lavalink trước, sau đó mới khởi động ứng dụng:

```bash
java -jar /opt/lavalink/Lavalink.jar --spring.config.location=/www/wwwroot/discord-bot/infra/lavalink/application.yml
npm run start
```

Web UI mặc định: `http://127.0.0.1:3000`

## Environment

Biến bắt buộc để chạy đầy đủ:

- `DATABASE_URL`: connection string cho Prisma runtime
- `DIRECT_URL`: connection string cho Prisma migrate
- `SESSION_SECRET`: chuỗi bí mật để ký admin session
- `DISCORD_TOKEN`: bot token từ Discord Developer Portal
- `DISCORD_APPLICATION_ID`: application ID để đăng ký slash commands
- `LAVALINK_URL`: ví dụ `http://127.0.0.1:2333`
- `LAVALINK_PASSWORD`: phải trùng với password trong Lavalink

Biến tùy chọn:

- `APP_MODE=all|bot|web`
- `DISCORD_COMMAND_GUILD_ID`
- `BOT_PRESENCE_TEXT`
- `ADMIN_BOOTSTRAP_USERNAME`
- `ADMIN_BOOTSTRAP_PASSWORD`
- `LAVALINK_CLIENT_NAME`
- `LAVALINK_RESUME_TIMEOUT_SECONDS`
- `MUSIC_PLAYLIST_MAX_ITEMS`: số lượng bài tối đa được nạp từ một playlist trong `/play`, mặc định `100`
- `LAVALINK_JAR`, `LAVALINK_CONFIG`, `JAVA_BIN`: chỉ dùng cho `ecosystem.config.cjs`

## Lavalink setup

Repo có sẵn file mẫu:

- `infra/lavalink/application.yml.example`
- `ecosystem.config.cjs`

Luồng setup tối thiểu:

1. Tải `Lavalink.jar` về VPS.
2. Copy `infra/lavalink/application.yml.example` thành `infra/lavalink/application.yml`.
3. Điền đúng password cho Lavalink và giữ trùng với `LAVALINK_PASSWORD` trong `.env`.
4. Cài plugin nguồn YouTube cho Lavalink rồi thay `VERSION` trong `application.yml`.

Nếu bạn muốn tiếp tục dùng `/play <tu-khoa>` theo kiểu tìm YouTube, Lavalink phải có plugin nguồn YouTube. File mẫu đang để sẵn block plugin `dev.lavalink.youtube:youtube-plugin:VERSION`; bạn chỉ cần thay `VERSION` bằng release đang dùng.

## PM2

Repo có sẵn `ecosystem.config.cjs` để chạy cả Node app lẫn Lavalink bằng PM2:

```bash
npm run build
npm run start:pm2
```

File này đọc `.env` bằng `dotenv`. Mặc định:

- app Node chạy `dist/main.js`
- Lavalink chạy bằng `java -jar ...`

Nếu bạn quản lý Lavalink ở nơi khác, chỉ cần bỏ app `discord-bot-lavalink` khỏi file PM2 hoặc start riêng app `discord-bot-admin`.

## Prisma

Các model chính:

- `GuildConfig`
- `LogRecord`
- `AdminUser`
- `AdminSession`

Lệnh hữu ích:

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:dev
npm run db:status
npm run db:studio
```

## Admin bootstrap

Tạo hoặc cập nhật admin:

```bash
npm run admin:bootstrap -- --username admin --password "replace-this-password"
```

## Discord permissions

Bot nên có các quyền sau:

- `View Audit Log`
- `View Channels`
- `Send Messages`
- `Embed Links`
- `Connect`
- `Speak`

Gateway intents đang dùng:

- `Guilds`
- `GuildVoiceStates`

## Slash commands

- `/play <query>`: thêm URL, playlist YouTube hoặc từ khóa tìm kiếm vào hàng chờ
- `/pause`
- `/resume`
- `/join`
- `/summon`
- `/leave`
- `/queue`
- `/volume <value>`

## Logging

- System logs được append vào `runtime/system.log.jsonl`
- Guild logs được lưu trong PostgreSQL
- Nếu guild có `logChannelId`, log sẽ được mirror sang Discord channel đó
- Nếu `GuildConfig.botEnabled=false`, bot sẽ từ chối slash command và player interaction trong guild đó
- Khi guild bị tắt, bot bỏ qua channel/voice activity logging và dừng playback đang chạy nếu có
- Dashboard và trang `/logs` hiển thị toàn bộ timestamp theo GMT+7

## Build

```bash
npm run build
```

Build script sẽ:

- generate Prisma client
- build Next.js App Router
- compile server runtime TypeScript vào `dist/`
