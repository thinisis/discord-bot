type UiTone = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

type ActionMeta = {
  tone: UiTone;
  label: string;
  family: string;
  severity: string;
  description: string;
};

type SystemLogMeta = {
  tone: UiTone;
  label: string;
  severity: string;
  description: string;
};

const ACTION_META: Record<string, ActionMeta> = {
  "channel.created": {
    tone: "success",
    label: "Tạo kênh",
    family: "Kênh",
    severity: "Bản ghi audit",
    description: "Một kênh mới vừa được tạo trong guild."
  },
  "channel.updated": {
    tone: "warning",
    label: "Cập nhật kênh",
    family: "Kênh",
    severity: "Bản ghi audit",
    description: "Một kênh vừa thay đổi; kiểm tra actor và thay đổi chính."
  },
  "channel.deleted": {
    tone: "danger",
    label: "Xóa kênh",
    family: "Kênh",
    severity: "Bản ghi audit",
    description: "Một kênh vừa bị xóa; nên xác minh actor nếu đây không phải thay đổi dự kiến."
  },
  "voice.joined": {
    tone: "primary",
    label: "Vào voice",
    family: "Voice",
    severity: "Hoạt động member",
    description: "Một member vừa tham gia voice channel."
  },
  "voice.left": {
    tone: "secondary",
    label: "Rời voice",
    family: "Voice",
    severity: "Hoạt động member",
    description: "Một member vừa rời voice channel."
  },
  "voice.moved": {
    tone: "warning",
    label: "Chuyển voice",
    family: "Voice",
    severity: "Hoạt động member",
    description: "Một member vừa chuyển giữa hai voice channel."
  }
};

export function getGuildActionMeta(action: string): ActionMeta {
  const directMatch = ACTION_META[action];

  if (directMatch) {
    return directMatch;
  }

  if (action.includes("deleted")) {
    return {
      tone: "danger",
      label: action,
      family: "Guild",
      severity: "Bản ghi sự kiện",
      description: "Bản ghi thuộc nhóm thay đổi đã xóa."
    };
  }

  if (action.includes("updated")) {
    return {
      tone: "warning",
      label: action,
      family: "Guild",
      severity: "Bản ghi sự kiện",
      description: "Bản ghi thuộc nhóm thay đổi đã cập nhật."
    };
  }

  if (action.includes("created")) {
    return {
      tone: "success",
      label: action,
      family: "Guild",
      severity: "Bản ghi sự kiện",
      description: "Bản ghi thuộc nhóm thay đổi vừa được tạo."
    };
  }

  if (action.startsWith("voice.")) {
    return {
      tone: "primary",
      label: action,
      family: "Voice",
      severity: "Hoạt động member",
      description: "Bản ghi đến từ luồng theo dõi voice activity."
    };
  }

  if (action.startsWith("channel.")) {
    return {
      tone: "secondary",
      label: action,
      family: "Kênh",
      severity: "Bản ghi audit",
      description: "Bản ghi đến từ luồng audit theo dõi channel của guild."
    };
  }

  return {
    tone: "default",
    label: action,
    family: "Guild",
    severity: "Bản ghi sự kiện",
    description: "Bản ghi guild tổng quát được lưu trong PostgreSQL."
  };
}

export function getSystemLogMeta(level: string): SystemLogMeta {
  switch (level) {
    case "error":
      return {
        tone: "danger",
        label: "Lỗi runtime",
        severity: "Ưu tiên cao",
        description: "Log lỗi có thể ảnh hưởng trực tiếp tới bot, panel hoặc Lavalink."
      };
    case "warn":
      return {
        tone: "warning",
        label: "Cảnh báo runtime",
        severity: "Cần chú ý",
        description: "Log cảnh báo nên được theo dõi trước khi trở thành lỗi thật."
      };
    case "info":
      return {
        tone: "primary",
        label: "Thông tin runtime",
        severity: "Thông tin",
        description: "Bản ghi thông tin về vòng đời ứng dụng và service nền."
      };
    default:
      return {
        tone: "default",
        label: "Output hệ thống",
        severity: "Chuẩn",
        description: "Output nền được capture trực tiếp từ runtime."
      };
  }
}

export function getActionTone(action: string): UiTone {
  return getGuildActionMeta(action).tone;
}

export function getSystemLogTone(level: string): UiTone {
  return getSystemLogMeta(level).tone;
}

export function getQueryParamValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
