import type { OperationSummary } from "./types";

/**
 * Client-side view helpers for the orders table.
 *
 * The screen reads the whole book once, then filters and paginates in the
 * browser so selection and bulk actions span every page instead of only the
 * rows that happened to be on screen.
 */

export const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;
export type OrderPageSize = (typeof PAGE_SIZE_OPTIONS)[number] | "all";

/** True when the row matches the free-text query across its reference fields. */
export function filterOperations(
  rows: readonly OperationSummary[],
  query: string,
): OperationSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return rows.slice();

  return rows.filter((row) =>
    [row.orderId, row.merchantName, row.courierName, row.couponCode].some(
      (value) => value.toLowerCase().includes(needle),
    ),
  );
}

export function pageCount(total: number, pageSize: OrderPageSize): number {
  if (pageSize === "all") return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamps a page to the valid range for the current row count and page size. */
export function clampPage(
  page: number,
  total: number,
  pageSize: OrderPageSize,
): number {
  const last = pageCount(total, pageSize);
  const safe = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(Math.max(1, safe), last);
}

/** The slice of `rows` on `page` for the chosen page size. */
export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: OrderPageSize,
): T[] {
  if (pageSize === "all") return rows.slice();
  const safe = clampPage(page, rows.length, pageSize);
  const start = (safe - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
