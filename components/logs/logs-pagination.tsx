import Link from "next/link";

import { AdminButton } from "@/components/ui/admin-button";
import type { PaginationMeta } from "@/src/lib/pagination";

type LogsPaginationProps = {
  pathname: string;
  searchParams: Record<string, string>;
  pageParam: string;
  pagination: PaginationMeta;
  itemLabel: string;
  note: string;
};

export function LogsPagination({
  pathname,
  searchParams,
  pageParam,
  pagination,
  itemLabel,
  note
}: LogsPaginationProps) {
  const previousHref = buildPageHref(pathname, searchParams, pageParam, pagination.page - 1);
  const nextHref = buildPageHref(pathname, searchParams, pageParam, pagination.page + 1);
  const rangeLabel =
    pagination.totalCount === 0
      ? `0 ${itemLabel}`
      : `${pagination.startItem}-${pagination.endItem} / ${pagination.totalCount} ${itemLabel}`;

  return (
    <div className="panel-toolbar flex flex-col gap-3 rounded-[0.95rem] px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="log-pill" data-tone="default">
            Trang {pagination.page}/{pagination.totalPages}
          </span>
          <span className="panel-meta">{rangeLabel}</span>
        </div>
        <p className="panel-copy">{note}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pagination.hasPreviousPage ? (
          <Link href={previousHref}>
            <AdminButton size="sm" tone="default">
              Trang trước
            </AdminButton>
          </Link>
        ) : (
          <AdminButton isDisabled size="sm" tone="default">
            Trang trước
          </AdminButton>
        )}

        {pagination.hasNextPage ? (
          <Link href={nextHref}>
            <AdminButton kind="solid" size="sm" tone="accent">
              Trang sau
            </AdminButton>
          </Link>
        ) : (
          <AdminButton isDisabled kind="solid" size="sm" tone="accent">
            Trang sau
          </AdminButton>
        )}
      </div>
    </div>
  );
}

function buildPageHref(
  pathname: string,
  searchParams: Record<string, string>,
  pageParam: string,
  nextPage: number
): string {
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (!value || key === pageParam) {
      continue;
    }

    nextSearchParams.set(key, value);
  }

  if (nextPage > 1) {
    nextSearchParams.set(pageParam, String(nextPage));
  }

  const search = nextSearchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}
