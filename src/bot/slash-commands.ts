import { ChannelType, SlashCommandBuilder } from "discord.js";

import { managedSlashCommandNames, managedSlashCommands } from "./managed-command-meta";

const slashCommandBuilders = [
  new SlashCommandBuilder().setName("help").setDescription("Xem danh sách lệnh"),
  new SlashCommandBuilder().setName("ping").setDescription("Kiểm tra trạng thái bot"),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Phát hoặc thêm bài, playlist hay URL vào hàng chờ")
    .addStringOption((option) =>
      option.setName("query").setDescription("URL, playlist hoặc từ khóa tìm kiếm").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Tìm bài trên YouTube và chọn kết quả để phát")
    .addStringOption((option) =>
      option.setName("query").setDescription("Từ khóa tìm kiếm trên YouTube").setRequired(true)
    ),
  new SlashCommandBuilder().setName("pause").setDescription("Tạm dừng track hiện tại"),
  new SlashCommandBuilder().setName("resume").setDescription("Tiếp tục track hiện tại"),
  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Bỏ qua bài hiện tại, một mục theo số thứ tự hoặc toàn bộ hàng chờ")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("Số thứ tự trong hàng chờ kế tiếp, bắt đầu từ 1")
        .setMinValue(1)
    )
    .addBooleanOption((option) =>
      option.setName("all").setDescription("Bỏ qua bài hiện tại và xóa toàn bộ hàng chờ còn lại")
    ),
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Vào voice channel hiện tại của bạn")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Voice channel đích")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),
  new SlashCommandBuilder()
    .setName("summon")
    .setDescription("Gọi bot vào một voice channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Voice channel đích")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),
  new SlashCommandBuilder().setName("leave").setDescription("Rời voice và xóa hàng chờ"),
  new SlashCommandBuilder().setName("queue").setDescription("Hiển thị hàng chờ hiện tại"),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Điều chỉnh âm lượng player")
    .addIntegerOption((option) =>
      option
        .setName("value")
        .setDescription("Phần trăm âm lượng")
        .setMinValue(0)
        .setMaxValue(200)
        .setRequired(true)
    )
];

export const slashCommands = slashCommandBuilders.map((command) => command.toJSON());
export { managedSlashCommands, managedSlashCommandNames };
