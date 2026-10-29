"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";

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
 * Row actions live in a Headless UI menu instead of loose buttons so the list
 * stays visually calm, and a rep cannot fat-finger "حذف" next to "تعديل".
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

      <Menu as="div" className="relative shrink-0">
        <MenuButton
          type="button"
          className="button button-small button-quiet"
          aria-label={`خيارات مسودة ${draft.payload.name}`}
        >
          <span aria-hidden="true">⋮</span>
          <span>خيارات</span>
        </MenuButton>

        <MenuItems
          transition
          anchor="bottom end"
          className="z-50 w-44 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-1 shadow-lg transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 focus:outline-none"
        >
          <MenuItem disabled={!canEdit}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onEdit(draft)}
              className="block w-full rounded-lg px-4 py-2 text-end text-sm font-medium text-purple-700 transition duration-150 ease-out data-[focus]:bg-purple-50 data-[focus]:text-purple-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
            >
              تعديل
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              onClick={() => onRemove(draft.clientProductId)}
              className="block w-full rounded-lg px-4 py-2 text-end text-sm font-medium text-red-600 transition duration-150 ease-out data-[focus]:bg-red-50 data-[focus]:text-red-700"
            >
              حذف
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
    </li>
  );
}
