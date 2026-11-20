"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { PAYOUT_METHOD_LABEL, type PayoutPreferences } from "@/lib/couriers/payout";
import { courierDate, courierMoney, courierStatusLabel } from "@/lib/couriers/format";
import type { Courier } from "@/lib/couriers/types";

import { CourierAttendanceControl } from "./courier-attendance-control";

type CourierDetailsModalProps = {
  courier: Courier | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (courier: Courier) => void;
  onChanged: () => void;
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
  onChanged,
}: CourierDetailsModalProps) {
  return (
    <Modal
      open={courier !== null}
      eyebrow="ملف مندوب التوصيل"
      title={courier?.displayName ?? "مندوب التوصيل"}
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

          <section className="courier-performance">
            <h3>الأداء الشهري</h3>
            <p className="muted">الشهر الحالي حتى تاريخه.</p>
            <dl className="courier-performance-grid">
              <div>
                <dt>إجمالي مبالغ التوصيل هذا الشهر</dt>
                <dd dir="ltr">
                  {courierMoney(courier.monthlyDeliveryAmount, "EGP")}
                </dd>
              </div>
              <div>
                <dt>إجمالي ربح مندوب التوصيل هذا الشهر</dt>
                <dd dir="ltr">{courierMoney(courier.monthlyProfit, "EGP")}</dd>
              </div>
            </dl>
          </section>

          <section className="courier-performance">
            <h3>مستحقات التوصيل اليومية</h3>
            <p className="muted">
              الثابت اليومي وأجر الطلبات حسب الشرائح، بعد خصم عمولة التحصيل.
            </p>
            <dl className="courier-performance-grid">
              <div>
                <dt>أيام الحضور</dt>
                <dd dir="ltr">{courier.pay.attendanceDays}</dd>
              </div>
              <div>
                <dt>الثابت اليومي (165 ج.م)</dt>
                <dd dir="ltr">
                  {courierMoney(courier.pay.baseMinor / 100, "EGP")}
                </dd>
              </div>
              <div>
                <dt>طلبات الشريحة الأولى (× 7 ج.م)</dt>
                <dd dir="ltr">
                  {courier.pay.tier1Orders} طلب ·{" "}
                  {courierMoney(courier.pay.tier1Minor / 100, "EGP")}
                </dd>
              </div>
              <div>
                <dt>طلبات فوق التارجت (× 15 ج.م)</dt>
                <dd dir="ltr">
                  {courier.pay.tier2Orders} طلب ·{" "}
                  {courierMoney(courier.pay.tier2Minor / 100, "EGP")}
                </dd>
              </div>
              <div>
                <dt>إجمالي مستحق السواق</dt>
                <dd dir="ltr">
                  {courierMoney(courier.pay.totalMinor / 100, "EGP")}
                </dd>
              </div>
              <div>
                <dt>صافي التسوية النهائي (ليك / عليك)</dt>
                <dd dir="ltr">{courierMoney(courier.balance, "EGP")}</dd>
              </div>
            </dl>

            {courier.pay.days.length > 0 ? (
              <ul className="coupon-import-issues">
                {courier.pay.days.slice(0, 30).map((day) => (
                  <li key={day.day} dir="ltr">
                    {day.day} · {day.deliveredOrders} طلب ·{" "}
                    {courierMoney(day.totalMinor / 100, "EGP")}
                  </li>
                ))}
              </ul>
            ) : null}

            <CourierAttendanceControl
              courier={courier}
              canManage={canManage}
              onChanged={onChanged}
            />
          </section>

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
