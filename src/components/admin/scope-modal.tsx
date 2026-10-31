"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { ChipToggle } from "@/components/ui/chip-toggle";
import type { AppUser } from "@/lib/rbac/types";
import type { CityOption } from "@/components/admin/user-form-types";

type ScopeModalProps = {
  target: AppUser | null;
  cities: CityOption[];
  selected: string[];
  saving: boolean;
  onSelectionChange: (next: string[]) => void;
  onClose: () => void;
  onSave: () => void;
};

/** City-scope dialog for one operator. */
export function ScopeModal({
  target,
  cities,
  selected,
  saving,
  onSelectionChange,
  onClose,
  onSave,
}: ScopeModalProps) {
  return (
    <Modal
      open={target !== null}
      title="نطاق مدن المشغّل"
      eyebrow="العزل الأفقي"
      description={
        target
          ? `حدّد المدن التي يصل إليها ${target.name}. لا يمكنك منح مدن خارج نطاقك.`
          : ""
      }
      onClose={onClose}
    >
      <div className="form-stack">
        <div className="scope-picker">
          {cities.map((city) => (
            <ChipToggle
              key={city.id}
              label={city.name}
              checked={selected.includes(city.id)}
              onChange={(checked) =>
                onSelectionChange(
                  checked
                    ? [...selected, city.id]
                    : selected.filter((id) => id !== city.id),
                )
              }
            />
          ))}
        </div>
        <div className="form-actions">
          <Button variant="quiet" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "حفظ النطاق"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
