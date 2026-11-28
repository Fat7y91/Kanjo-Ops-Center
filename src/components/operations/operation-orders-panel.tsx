"use client";

import { useMemo, useState } from "react";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import {
  clampPage,
  filterOperations,
  pageCount,
  paginate,
  type OrderPageSize,
} from "@/lib/operations/table";
import type { OperationSummary } from "@/lib/operations/types";

import { OperationRecentList } from "./operation-recent-list";
import { OrderTableControls } from "./order-table-controls";

/**
 * The orders table and its pagination.
 *
 * The page receives the whole book (bounded by the repository), so filtering,
 * paging and "select all" run in the browser. Selection is owned by the parent
 * so it survives a page change and bulk delete applies to every selected row,
 * not only the visible page.
 */
export function OperationOrdersPanel({
  operations,
  total,
  canImport,
  canDelete,
  canEditCommission,
  selected,
  onToggle,
  onToggleAll,
  onDelete,
  onEditCommission,
  deleting,
  onOpenCreate,
  onOpenImport,
}: {
  operations: OperationSummary[];
  total: number;
  canImport: boolean;
  canDelete: boolean;
  canEditCommission: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean, ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onEditCommission: (operation: OperationSummary) => void;
  deleting: boolean;
  onOpenCreate: () => void;
  onOpenImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<OrderPageSize>(100);

  const filtered = useMemo(
    () => filterOperations(operations, query),
    [operations, query],
  );
  const filteredIds = useMemo(
    () => filtered.map((row) => row.id),
    [filtered],
  );
  const pages = pageCount(filtered.length, pageSize);
  const safePage = clampPage(page, filtered.length, pageSize);
  const paged = useMemo(
    () => paginate(filtered, safePage, pageSize),
    [filtered, safePage, pageSize],
  );
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const countLabel = query.trim()
    ? `${filtered.length} نتيجة من ${total} طلب`
    : total > operations.length
      ? `عرض ${operations.length} من ${total} طلب`
      : `${total} طلب`;

  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <h2>الطلبات</h2>
          <span className="muted">{countLabel}</span>
        </div>
        <DropdownMenu
          label="إضافة طلبات +"
          items={[
            { id: "new-order", label: "طلب جديد", onSelect: onOpenCreate },
            {
              id: "import-orders",
              label: "استيراد ملف CSV",
              onSelect: onOpenImport,
              disabled: !canImport,
            },
          ]}
        />
      </div>

      <OrderTableControls
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        page={safePage}
        pageCount={pages}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        countLabel={countLabel}
      >
        <OperationRecentList
          operations={paged}
          canDelete={canDelete}
          canEditCommission={canEditCommission}
          selected={selected}
          selectedIds={selectedIds}
          allFilteredSelected={allFilteredSelected}
          onToggle={onToggle}
          onToggleAll={(checked) => onToggleAll(checked, filteredIds)}
          onDelete={onDelete}
          onEditCommission={onEditCommission}
          deleting={deleting}
        />
      </OrderTableControls>
    </article>
  );
}
