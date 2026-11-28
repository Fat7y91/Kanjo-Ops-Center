"use client";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import type { CatalogDraft } from "@/lib/catalog/draft-queue";

type DraftListItemProps = {
  draft: CatalogDraft;
  canEdit: boolean;
  onEdit: (draft: CatalogDraft) => void;
  onRemove: (clientProductId: string) => void;
};

/**
 * One queued draft row.
 *
 * Row actions live in the shared `DropdownMenu` primitive so every module uses
 * the same "خيارات" affordance instead of scattered row buttons.
 */
export function DraftListItem({
  draft,
  canEdit,
  onEdit,
  onRemove,
}: DraftListItemProps) {
  return (
    <li className="cat-queue-item">
      <div className="cat-queue-item-main">
        <strong>{draft.payload.name}</strong>
        <span className="cat-queue-item-meta">
          {draft.payload.merchantName} · {draft.payload.sku || "SKU تلقائي"}
        </span>
        {draft.lastError ? (
          <span className="cat-queue-error" role="status">
            {draft.lastError}
            {draft.attempts > 0 ? ` (محاولة ${draft.attempts})` : ""}
          </span>
        ) : null}
      </div>

      <DropdownMenu
        label={
          <>
            <span aria-hidden="true">⋮</span>
            <span>خيارات</span>
          </>
        }
        buttonProps={{
          "aria-label": `خيارات مسودة ${draft.payload.name}`,
        }}
        items={[
          {
            id: "edit",
            label: "تعديل",
            disabled: !canEdit,
            onSelect: () => onEdit(draft),
          },
          {
            id: "delete",
            label: "حذف",
            tone: "danger",
            onSelect: () => onRemove(draft.clientProductId),
          },
        ]}
      />
    </li>
  );
}
