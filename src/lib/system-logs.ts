import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatWithOptions } from "node:util";

import { createPaginationMeta } from "./pagination";

export type SystemLogLevel = "log" | "info" | "warn" | "error";

export type SystemLogEntry = {
  id: string;
  level: SystemLogLevel;
  message: string;
  createdAt: string;
};

declare global {
  var __discordSystemLogCaptureInstalled__: boolean | undefined;
  var __discordSystemLogSequence__: number | undefined;
}

const LOG_DIRECTORY_PATH = resolve(process.cwd(), "runtime");
const SYSTEM_LOG_FILE_PATH = resolve(LOG_DIRECTORY_PATH, "system.log.jsonl");
const MAX_SYSTEM_LOG_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SYSTEM_LOG_FILE_LINES = 1200;
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;]*m/g;

export function installSystemLogCapture(): void {
  if (globalThis.__discordSystemLogCaptureInstalled__) {
    return;
  }

  ensureSystemLogDirectory();
  trimSystemLogFileIfNeeded();

  for (const level of ["log", "info", "warn", "error"] as const) {
    const originalMethod = (Reflect.get(console, level) as (...data: unknown[]) => void).bind(console);

    Reflect.set(console, level, (...data: unknown[]) => {
      writeSystemLogEntry(level, data);
      originalMethod(...data);
    });
  }

  globalThis.__discordSystemLogCaptureInstalled__ = true;
}

export function getSystemLogFilePath(): string {
  return SYSTEM_LOG_FILE_PATH;
}

export function readSystemLogEntries(limit = 100): SystemLogEntry[] {
  return readSystemLogPage(1, limit).entries;
}

export function readSystemLogPage(page = 1, pageSize = 100) {
  if (pageSize <= 0) {
    return {
      entries: [],
      pagination: createPaginationMeta(page, 1, 0)
    };
  }

  const allEntries = readAllSystemLogEntries();
  const pagination = createPaginationMeta(page, pageSize, allEntries.length);

  return {
    entries: allEntries.slice(pagination.offset, pagination.offset + pagination.pageSize),
    pagination
  };
}

function readAllSystemLogEntries(): SystemLogEntry[] {
  try {
    if (!existsSync(SYSTEM_LOG_FILE_PATH)) {
      return [];
    }

    const recentLines = readFileSync(SYSTEM_LOG_FILE_PATH, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .reverse();

    return recentLines.flatMap((line, index) => {
      try {
        const parsed = JSON.parse(line) as Partial<SystemLogEntry>;
        if (!isSystemLogLevel(parsed.level) || typeof parsed.message !== "string" || typeof parsed.createdAt !== "string") {
          return [];
        }

        return [
          {
            id: typeof parsed.id === "string" ? parsed.id : `${parsed.createdAt}-${index}`,
            level: parsed.level,
            message: parsed.message,
            createdAt: parsed.createdAt
          }
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function writeSystemLogEntry(level: SystemLogLevel, data: unknown[]): void {
  const entry: SystemLogEntry = {
    id: `${Date.now()}-${nextSystemLogSequence()}`,
    level,
    message: formatSystemLogMessage(data),
    createdAt: new Date().toISOString()
  };

  try {
    ensureSystemLogDirectory();
    appendFileSync(SYSTEM_LOG_FILE_PATH, `${JSON.stringify(entry)}\n`, "utf8");

    if ((globalThis.__discordSystemLogSequence__ ?? 0) % 25 === 0) {
      trimSystemLogFileIfNeeded();
    }
  } catch {
    // Ignore logging failures so runtime output itself is never blocked.
  }
}

function ensureSystemLogDirectory(): void {
  if (!existsSync(LOG_DIRECTORY_PATH)) {
    mkdirSync(LOG_DIRECTORY_PATH, { recursive: true });
  }
}

function trimSystemLogFileIfNeeded(): void {
  try {
    if (!existsSync(SYSTEM_LOG_FILE_PATH)) {
      return;
    }

    if (statSync(SYSTEM_LOG_FILE_PATH).size <= MAX_SYSTEM_LOG_FILE_BYTES) {
      return;
    }

    const trimmedLines = readFileSync(SYSTEM_LOG_FILE_PATH, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-MAX_SYSTEM_LOG_FILE_LINES);

    writeFileSync(
      SYSTEM_LOG_FILE_PATH,
      trimmedLines.length > 0 ? `${trimmedLines.join("\n")}\n` : "",
      "utf8"
    );
  } catch {
    // Ignore trimming failures. Runtime logging should stay best-effort.
  }
}

function formatSystemLogMessage(data: unknown[]): string {
  const formatted = formatWithOptions(
    {
      colors: false,
      depth: 5,
      breakLength: 120
    },
    ...data
  );

  return formatted.replace(ANSI_ESCAPE_PATTERN, "").trimEnd() || "(empty log message)";
}

function nextSystemLogSequence(): number {
  const nextValue = (globalThis.__discordSystemLogSequence__ ?? 0) + 1;
  globalThis.__discordSystemLogSequence__ = nextValue;
  return nextValue;
}

function isSystemLogLevel(value: unknown): value is SystemLogLevel {
  return value === "log" || value === "info" || value === "warn" || value === "error";
}
