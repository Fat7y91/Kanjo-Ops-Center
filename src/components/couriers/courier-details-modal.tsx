"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { PAYOUT_METHOD_LABEL, type PayoutPreferences } from "@/lib/couriers/payout";
import { courierDate, courierMoney, courierStatusLabel } from "@/lib/couriers/format";
import type { Courier } from "@/lib/couriers/types";

type CourierDetailsModalProps = {
  courier: Courier | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (courier: Courier) => void;
};

function payoutDetail(value: PayoutPreferences | null): string {
  if (!value) return "—";
  switch (value.method) {
    case "bank_account":
      return `${PAYOUT_METHOD_LABEL.bank_account} · ${value.bankName} · ${value.accountNumber}`;
    case "e_wallet":
      return `${value.provider} · ${value.walletPhone}`;
    case "instapay":
      return `${PAYOUT_METHOD_LABEL.instapay} · ${value.instapayValue}`;
    case "egypt_post":
      return `${value.postOffice} · ${value.beneficiaryName}`;
  }
}

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
              <dt>الربح الثابت لكل طلب</dt>
              <dd dir="ltr">
                {courierMoney(courier.fixedProfitPerOrder, "EGP")}
              </dd>
            </div>
            <div>
              <dt>بيانات الصرف</dt>
              <dd>{payoutDetail(courier.payoutPreferences)}</dd>
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
