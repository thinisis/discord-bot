export const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;

export type Gmt7DateParts = {
  year: number;
  monthIndex: number;
  dayOfMonth: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  second: number;
};

export function getGmt7DateParts(input: Date | number = Date.now()): Gmt7DateParts {
  const value = typeof input === "number" ? new Date(input) : input;
  const shifted = new Date(value.getTime() + GMT7_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    dayOfMonth: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

export function createUtcDateFromGmt7(parts: {
  year: number;
  monthIndex: number;
  dayOfMonth: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  return new Date(
    Date.UTC(
      parts.year,
      parts.monthIndex,
      parts.dayOfMonth,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0
    ) - GMT7_OFFSET_MS
  );
}
