# Discord Control — Go

Ứng dụng quản trị Discord tự host: toàn bộ backend, bot, kết nối Lavalink và lịch gửi được viết bằng Go. Frontend dùng cùng stack React 19 + TypeScript + Vite + Motion + Zustand với CLI Proxy API. Bộ Button/Input/Select/Modal/Toggle/Card/Skeleton và theme tokens được tái sử dụng từ nguồn CLI qua workspace `frontend/shared/cli-ui`, có script đồng bộ và kiểm tra hash. Bản build frontend được nhúng trong cùng binary Go; sidebar, tab và chuyển trang có animation, hỗ trợ reduced motion, ba theme và mobile.

Không cần Node.js, Next.js, Prisma hoặc Redis để chạy. PostgreSQL giữ dữ liệu; Lavalink là dịch vụ phát âm thanh riêng (Java).

## Chức năng

- Admin bcrypt, phiên đăng nhập ký HMAC, cookie HttpOnly/SameSite, kiểm tra origin và giới hạn đăng nhập sai.
- Cài đặt → Tài khoản: đổi mật khẩu bằng mật khẩu hiện tại, xác nhận mật khẩu mới, thay phiên hiện tại và thu hồi mọi phiên khác.
- Dashboard trạng thái Discord, Lavalink, bộ nhớ, uptime và dữ liệu thực tế.
- Bật/tắt bot theo guild, kênh mirror logs, âm lượng 0–200%.
- Audit logs tạo/sửa/xóa kênh, log vào/rời/chuyển voice, tra cứu và phân trang.
- 12 slash commands: help, ping, play, search, pause, resume, skip, join, summon, leave, queue, volume.
- YouTube/playlist/search qua Lavalink, menu chọn bài, nút điều khiển player, queue phân trang.
- Trang chủ công khai và luồng liên kết YouTube trong Cài đặt → YouTube.
- Phân quyền từng command cho mọi người hoặc owner; điều khiển player cần cùng voice channel.
- Presence theo bài đang phát hoặc khung giờ GMT+7.
- Lịch gửi một lần/hàng ngày/hàng tuần lưu trong PostgreSQL, polling mỗi 15 giây, khóa hàng `FOR UPDATE SKIP LOCKED`, retry sau 5 phút khi gửi lỗi.
- Tự kết nối lại Lavalink, session resume; dừng tự chuyển bài sau ba lỗi phát liên tiếp và giữ queue còn lại.

## Triển khai

Yêu cầu Docker + Docker Compose. Xem `deploy/README.md`.

```sh
cp .env.example .env
# Điền các giá trị trong .env, bao gồm bootstrap admin cho database mới.
docker compose --env-file .env -f deploy/compose.yml up -d --build
```

Panel bind vào `127.0.0.1:3817`. Reverse proxy HTTPS tới cổng này.

Database mới được khởi tạo từ SQL nhúng trong `migrations/`. Database đã có từ bản Node dùng nguyên bảng, tài khoản, bcrypt hash, session HMAC, guild settings, command policies, lịch gửi và logs. Giữ nguyên `SESSION_SECRET` để bảo toàn phiên đăng nhập và giải mã thông tin liên kết YouTube.

## Phát triển

Go 1.26; frontend dùng Bun 1.3.14 và Node.js 22.12+ trong bước build (Docker tự xử lý):

```sh
cd frontend
bun install --frozen-lockfile
bun run verify
cd ..
go test -race ./...
go vet ./...
go build -trimpath -o discord-control ./cmd/server
```

Binary đọc cấu hình từ biến môi trường. Static assets và migrations được nhúng bằng `go:embed`. Docker build frontend bằng Vite trước khi biên dịch Go; container production không có runtime Node/Bun. Xem `frontend/README.md` và `frontend/shared/cli-ui/README.md`.

`APP_MODE=all|web|bot` điều khiển thành phần được chạy. Các API quản trị yêu cầu đăng nhập; `/api/healthz` chỉ trả trạng thái cơ bản không chứa thông tin guild/voice.

## Lưu ý vận hành

- `runtime/system.log.jsonl` của bản Node và `runtime/go-system.log.jsonl` được đọc để hiển thị lịch sử. Giữ volume runtime khi nâng cấp.
- Queue nhạc nằm trong RAM, bị xóa khi ứng dụng restart. Lavalink có thể resume khi chỉ kết nối WebSocket bị ngắt.
- Một số video YouTube yêu cầu xác thực. Liên kết trong Cài đặt → YouTube bằng mã thiết bị và tài khoản Google; Google yêu cầu quyền quản lý YouTube, nên cân nhắc dùng tài khoản phụ. OAuth không đảm bảo phát được mọi video.
- Lavalink phải bật client `TV` của youtube-source và đặt `logging.request.enabled: false` để tránh ghi refresh token vào log. Token được mã hóa trong PostgreSQL; bảo vệ `SESSION_SECRET` và bản sao lưu database.
- Compose chạy yt-cipher nội bộ để giải mã liên kết âm thanh YouTube. Cấu hình đang ghim bản snapshot youtube-source chứa bản vá client TV và phiên bản image yt-cipher đã kiểm thử; cần theo dõi cập nhật upstream khi YouTube thay đổi.
- Lịch gửi sử dụng PostgreSQL nên không cần Upstash. Việc gửi tin nhắn ra Discord và ghi trạng thái DB không thể là một transaction nguyên tử; nếu tiến trình chết sau khi Discord nhận tin nhưng trước khi commit, có thể gửi lặp. Khóa hàng ngăn hai worker gửi đồng thời trong điều kiện bình thường.
