"use client";

import { InputControl } from "@/components/ui/form-inputs";
import { riderMoney } from "@/lib/riders/format";
import { lineTotal } from "@/lib/riders/totals";
import {
  CUSTODY_ITEM_SHORT_LABEL,
  type CustodyItemDraft,
  type CustodyItemKey,
} from "@/lib/riders/types";

type CustodyItemsEditorProps = {
  items: CustodyItemDraft[];
  serials: Map<CustodyItemKey, string | null>;
  onUpdate: (
    key: CustodyItemKey,
    patch: Partial<CustodyItemDraft>,
  ) => void;
};

export function CustodyItemsEditor({
  items,
  serials,
  onUpdate,
}: CustodyItemsEditorProps) {
  return (
    <div className="custody-items">
      <div className="custody-items-head" aria-hidden="true">
        <span>البند</span>
        <span>السيريال</span>
        <span>الحالة</span>
        <span>الكمية</span>
        <span>سعر الوحدة</span>
        <span>الإجمالي</span>
      </div>

      {items.map((item) => {
        const serial = serials.get(item.key);
        return (
          <div className="custody-item-row" key={item.key}>
            <div className="custody-item-name">
              {item.key === "OTHER" ? (
                <InputControl
                  value={item.label}
                  onChange={(event) =>
                    onUpdate(item.key, { label: event.target.value })
                  }
                  placeholder="اسم البند"
                  aria-label="اسم البند الإضافي"
                  maxLength={80}
                />
              ) : (
                <strong>{CUSTODY_ITEM_SHORT_LABEL[item.key]}</strong>
              )}
              {item.key === "OTHER" ? (
                <InputControl
                  value={item.codePrefix ?? ""}
                  onChange={(event) =>
                    onUpdate(item.key, {
                      codePrefix: event.target.value.toUpperCase().slice(0, 8),
                    })
                  }
                  placeholder="كود البند"
                  aria-label="كود البند الإضافي"
                  maxLength={8}
                  dir="ltr"
                />
              ) : null}
            </div>

            <span className="custody-serial" dir="ltr">
              {serial ?? "—"}
            </span>

            <InputControl
              value={item.condition}
              onChange={(event) =>
                onUpdate(item.key, { condition: event.target.value })
              }
              aria-label={`حالة ${CUSTODY_ITEM_SHORT_LABEL[item.key]}`}
              maxLength={40}
            />

            <InputControl
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={item.quantity}
              onChange={(event) =>
                onUpdate(item.key, {
                  quantity: Math.max(
                    0,
                    Math.min(99, Number(event.target.value) || 0),
                  ),
                })
              }
              aria-label={`كمية ${CUSTODY_ITEM_SHORT_LABEL[item.key]}`}
              dir="ltr"
            />

            <InputControl
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={item.unitPrice}
              onChange={(event) =>
                onUpdate(item.key, {
                  unitPrice: Math.max(0, Number(event.target.value) || 0),
                })
              }
              aria-label={`سعر وحدة ${CUSTODY_ITEM_SHORT_LABEL[item.key]}`}
              dir="ltr"
            />

            <span className="custody-line-total" dir="ltr">
              {riderMoney(lineTotal(item.quantity, item.unitPrice))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
