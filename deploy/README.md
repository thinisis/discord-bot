# Transfer Bundle + Quick Setup

Mục tiêu của thư mục này:

- đóng gói source để chuyển sang máy chủ khác
- không ghi đè `.env` hoặc `infra/lavalink/application.yml` nếu máy đích đã có sẵn
- cài nhanh Lavalink theo đúng version đang chạy ổn trên máy hiện tại

## Tạo gói source để chuyển server

Từ repo root:

```bash
./deploy/create-transfer-bundle.sh
```

Gói tạo ra ở `release/discord-bot-transfer-<UTC>.tar.gz`.

Các mục bị loại khỏi bundle:

- `.env`
- `infra/lavalink/application.yml`
- `.git`
- `node_modules`
- `.next`
- `dist`
- `runtime`
- `release`

## Setup nhanh trên máy mới

Giả sử giải nén vào `/srv/discord-bot`:

```bash
tar -xzf discord-bot-transfer-*.tar.gz -C /srv
cd /srv/discord-bot
chmod +x deploy/*.sh
./deploy/quick-setup.sh
sudo ./deploy/install-lavalink.sh
```

## Giá trị cần chỉnh trên máy mới

Trong `.env`:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3817` hoặc cổng bạn muốn
- `DATABASE_URL`
- `DIRECT_URL`
- `SESSION_SECRET`
- `DISCORD_TOKEN`
- `DISCORD_APPLICATION_ID`
- `LAVALINK_URL=http://127.0.0.1:2333`
- `LAVALINK_PASSWORD=<phải trùng với password trong Lavalink>`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Nếu dùng PM2 để quản lý luôn Lavalink:

- `LAVALINK_JAR=/opt/lavalink/Lavalink.jar`
- `LAVALINK_CONFIG=/opt/lavalink/application.yml`
- `JAVA_BIN=java`

## Khởi động

Chạy cả app và Lavalink qua PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Nếu Lavalink chạy riêng:

```bash
pm2 start ecosystem.config.cjs --only discord-bot-admin
pm2 save
```

## Smoke test tối thiểu

App:

```bash
curl http://127.0.0.1:3817/api/healthz
```

Lavalink:

```bash
curl http://127.0.0.1:2333/v4/info -H "Authorization: <LAVALINK_PASSWORD>"
```

Version quick setup hiện đang bám theo máy hiện tại:

- Lavalink `4.2.2`
- youtube-plugin `1.18.0`
