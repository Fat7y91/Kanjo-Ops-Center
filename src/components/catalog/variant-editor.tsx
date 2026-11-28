"use client";

import { Button } from "@/components/ui/button";
import { InputControl, ToggleField } from "@/components/ui/form-inputs";
import {
  variantRowKey,
  type EditableVariantRow,
} from "@/lib/catalog/variant-edit";

type VariantEditorProps = {
  rows: EditableVariantRow[];
  disabled?: boolean;
  onChange: (rows: EditableVariantRow[]) => void;
};

/**
 * Editable variant table for one product.
 *
 * Rows keep their taxonomy option ids from the selector, so changing a price,
 * SKU, barcode or availability never rewrites the variant identity. Reordering
 * moves whole rows, which keeps the stored order stable for the merchant.
 */
export function VariantEditor({
  rows,
  disabled = false,
  onChange,
}: VariantEditorProps) {
  if (rows.length === 0) {
    return (
      <p className="cat-hint">
        اختر خيارات المتغيرات أعلاه ثم أضفها إلى الجدول لضبط سعر وبيانات كل
        متغير.
      </p>
    );
  }

  function patch(id: string, next: Partial<EditableVariantRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="cat-matrix">
      <div className="cat-matrix-head">
        <span className="cat-matrix-title">
          متغيرات المنتج
          <span className="cat-matrix-count">{rows.length}</span>
        </span>
        <span className="cat-hint">
          عدّل السعر و SKU والباركود لكل متغير، أو أعد ترتيب الصفوف.
        </span>
      </div>

      <div className="cat-matrix-scroll">
        <table className="cat-matrix-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">المتغير</th>
              <th scope="col">السعر</th>
              <th scope="col">SKU</th>
              <th scope="col">الباركود</th>
              <th scope="col">متاح</th>
              <th scope="col">ترتيب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={variantRowKey(row.variantId, row.optionIds) + row.id}>
                <td className="cat-matrix-name">{index + 1}</td>
                <td>
                  <InputControl
                    value={row.label}
                    onChange={(event) =>
                      patch(row.id, { label: event.target.value })
                    }
                    placeholder="اسم المتغير"
                    aria-label={`اسم المتغير ${index + 1}`}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <InputControl
                    className="cat-matrix-price py-1.5 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={row.price}
                    onChange={(event) =>
                      patch(row.id, { price: event.target.value })
                    }
                    placeholder="0"
                    aria-label={`سعر المتغير ${index + 1}`}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <InputControl
                    dir="ltr"
                    value={row.sku}
                    onChange={(event) =>
                      patch(row.id, { sku: event.target.value })
                    }
                    aria-label={`SKU المتغير ${index + 1}`}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <InputControl
                    dir="ltr"
                    inputMode="numeric"
                    value={row.barcode}
                    onChange={(event) =>
                      patch(row.id, { barcode: event.target.value })
                    }
                    aria-label={`باركود المتغير ${index + 1}`}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <ToggleField
                    label={<span className="sr-only">متاح</span>}
                    checked={row.available}
                    onChange={(next) => patch(row.id, { available: next })}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`نقل المتغير ${index + 1} لأعلى`}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled || index === rows.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`نقل المتغير ${index + 1} لأسفل`}
                    >
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={disabled}
                      onClick={() =>
                        onChange(rows.filter((entry) => entry.id !== row.id))
                      }
                    >
                      حذف
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
