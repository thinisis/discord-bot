export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  offset: number;
  startItem: number;
  endItem: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function parsePageParam(value: string | string[] | undefined, fallback = 1): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = Number.parseInt(rawValue ?? "", 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return parsedValue;
}

export function createPaginationMeta(page: number, pageSize: number, totalCount: number): PaginationMeta {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const normalizedPage = totalCount === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const offset = (normalizedPage - 1) * safePageSize;
  const startItem = totalCount === 0 ? 0 : offset + 1;
  const endItem = totalCount === 0 ? 0 : Math.min(offset + safePageSize, totalCount);

  return {
    page: normalizedPage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
    offset,
    startItem,
    endItem,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage: normalizedPage < totalPages
  };
}
