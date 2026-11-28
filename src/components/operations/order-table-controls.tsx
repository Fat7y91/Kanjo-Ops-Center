"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  PAGE_SIZE_OPTIONS,
  type OrderPageSize,
} from "@/lib/operations/table";

const PAGE_SIZE_CHOICES = [
  ...PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) })),
  { value: "all", label: "الكل" },
];

/** Parses the select menu's string back into a page size union value. */
function toPageSize(value: string): OrderPageSize {
  return value === "all" ? "all" : (Number(value) as OrderPageSize);
}

/**
 * Search, page-size and pager for the orders table.
 *
 * The table is rendered as children so the controls above and below it share
 * one component and the page arithmetic lives in exactly one place.
 */
export function OrderTableControls({
  query,
  onQueryChange,
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  countLabel,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize: OrderPageSize;
  onPageSizeChange: (size: OrderPageSize) => void;
  countLabel: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="order-table-tools">
        <TextField
          label="بحث"
          placeholder="رقم الطلب، التاجر، المندوب أو الكوبون…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <div className="order-table-tools-meta">
          <span className="muted">{countLabel}</span>
          <div className="order-table-page-size">
            <SelectMenu
              label="عدد الصفوف"
              value={String(pageSize)}
              onChange={(value) => onPageSizeChange(toPageSize(value))}
              options={PAGE_SIZE_CHOICES}
            />
          </div>
        </div>
      </div>

      {children}

      {pageCount > 1 ? (
        <nav className="table-pagination" aria-label="ترقيم صفحات الطلبات">
          <Button
            size="sm"
            variant="quiet"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            السابق
          </Button>
          <span className="table-pagination-label">
            الصفحة {page} من {pageCount}
          </span>
          <Button
            size="sm"
            variant="quiet"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            التالي
          </Button>
        </nav>
      ) : null}
    </>
  );
}
