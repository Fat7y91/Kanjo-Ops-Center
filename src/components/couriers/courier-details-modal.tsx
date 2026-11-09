"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import {
  availabilityLabel,
  courierDate,
  courierMoney,
  courierStatusLabel,
} from "@/lib/couriers/format";
import type { Courier } from "@/lib/couriers/types";

type CourierDetailsModalProps = {
  courier: Courier | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (courier: Courier) => void;
};

export function CourierDetailsModal({
  courier,
  canManage,
  onClose,
  onEdit,
}: CourierDetailsModalProps) {
  return (
    <Modal
      open={courier !== null}
      eyebrow="ملف المندوب"
      title={courier?.displayName ?? "المندوب"}
      onClose={onClose}
    >
      {courier ? (
        <>
          <dl className="courier-details">
            <div>
              <dt>الهاتف</dt>
              <dd dir="ltr">{courier.phone || "—"}</dd>
            </div>
            <div>
              <dt>البريد الإلكتروني</dt>
              <dd dir="ltr">{courier.email || "—"}</dd>
            </div>
            <div>
              <dt>المركبة</dt>
              <dd>{courier.vehicleType || "—"}</dd>
            </div>
            <div>
              <dt>اللوحة</dt>
              <dd dir="ltr">{courier.vehiclePlate || "—"}</dd>
            </div>
            <div>
              <dt>نسبة الربح</dt>
              <dd dir="ltr">{courier.cutPercent}%</dd>
            </div>
            <div>
              <dt>التوفر</dt>
              <dd>{availabilityLabel(courier.availability)}</dd>
            </div>
            <div>
              <dt>عدد التوصيلات</dt>
              <dd dir="ltr">{courier.deliveries}</dd>
            </div>
            <div>
              <dt>إجمالي الربح</dt>
              <dd dir="ltr">{courierMoney(courier.earnings, "EGP")}</dd>
            </div>
            <div>
              <dt>الرصيد المعلق</dt>
              <dd dir="ltr">{courierMoney(courier.balance, "EGP")}</dd>
            </div>
            <div>
              <dt>الحالة</dt>
              <dd>{courierStatusLabel(courier.active)}</dd>
            </div>
            <div>
              <dt>تاريخ التقديم</dt>
              <dd>{courierDate(courier.appliedAt)}</dd>
            </div>
          </dl>

          {canManage ? (
            <div className="courier-modal-actions">
              <Button variant="primary" onClick={() => onEdit(courier)}>
                تعديل البيانات
              </Button>
              <Button variant="quiet" onClick={onClose}>
                إغلاق
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
