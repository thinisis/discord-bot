# Docker setup

Từ repo root:

```sh
cp .env.example .env
# Điền .env. POSTGRES_PASSWORD phải khớp password trong DATABASE_URL.
# ADMIN_BOOTSTRAP_* chỉ dùng để tạo tài khoản đầu tiên.
docker compose --env-file .env -f deploy/compose.yml up -d --build
```

Ứng dụng: http://127.0.0.1:3817. Chạy reverse proxy HTTPS để truy cập từ xa.

```sh
docker compose --env-file .env -f deploy/compose.yml ps
docker compose --env-file .env -f deploy/compose.yml logs --tail 100 app
```

Cấu hình YouTube/Lavalink: `infra/lavalink/application.yml.example`. Password được lấy từ `LAVALINK_PASSWORD` qua biến môi trường của container.

Ba volume giữ PostgreSQL, logs ứng dụng và plugin Lavalink. Không chạy `down -v` nếu cần giữ dữ liệu.

Sao lưu database:

```sh
docker compose --env-file .env -f deploy/compose.yml exec -T db pg_dump -U discord discord > discord-backup.sql
chmod 600 discord-backup.sql
```

Máy chủ bot.thinnguyen.com hiện dùng file compose riêng ở `/www/wwwroot/bot.thinnguyen.com/deployment/compose.yml`, trỏ tới cùng mã nguồn và các volume đang có.
