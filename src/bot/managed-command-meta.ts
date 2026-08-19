export const managedSlashCommands = [
  { name: "help", description: "Xem danh sách lệnh" },
  { name: "ping", description: "Kiểm tra trạng thái bot" },
  { name: "play", description: "Phát hoặc thêm bài, playlist hay URL vào hàng chờ" },
  { name: "search", description: "Tìm bài trên YouTube và chọn kết quả để phát" },
  { name: "pause", description: "Tạm dừng track hiện tại" },
  { name: "resume", description: "Tiếp tục track hiện tại" },
  { name: "skip", description: "Bỏ qua bài hiện tại, một mục theo số thứ tự hoặc toàn bộ hàng chờ" },
  { name: "join", description: "Vào voice channel hiện tại của bạn" },
  { name: "summon", description: "Gọi bot vào một voice channel" },
  { name: "leave", description: "Rời voice và xóa hàng chờ" },
  { name: "queue", description: "Hiển thị hàng chờ hiện tại" },
  { name: "volume", description: "Điều chỉnh âm lượng player" }
] as const;

export const managedSlashCommandNames = managedSlashCommands.map((command) => command.name);
