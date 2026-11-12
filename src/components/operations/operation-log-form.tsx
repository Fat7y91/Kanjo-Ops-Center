"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { Button } from "@/components/ui/button";
import { couponTypeLabel } from "@/lib/coupons/format";
import { pickLabel } from "@/lib/operations/optimistic";
import type {
  CourierOption,
  CouponOption,
  MerchantOption,
  OperationSummary,
} from "@/lib/operations/types";

import { OrderImportModal } from "./order-import-modal";
import { OperationLogFields, NO_COUPON } from "./operation-log-fields";
import { OperationRecentList } from "./operation-recent-list";
import { useOperationForm } from "./use-operation-form";

export function OperationLogForm({
  couriers,
  merchants,
  coupons,
  initialOperations,
}: {
  couriers: CourierOption[];
  merchants: MerchantOption[];
  coupons: CouponOption[];
  initialOperations: OperationSummary[];
}) {
  const merchantList = Array.isArray(merchants) ? merchants : [];
  const courierList = Array.isArray(couriers) ? couriers : [];
  const couponList = Array.isArray(coupons) ? coupons : [];

  const { hasPermission } = usePermission();
  const canImport = hasPermission("import_orders");
  const [importOpen, setImportOpen] = useState(false);

  const {
    form,
    set,
    submit,
    operations,
    error,
    notice,
    busy,
    dismissNotice,
    dismissError,
  } = useOperationForm(initialOperations);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismissNotice, 4500);
    return () => window.clearTimeout(timer);
  }, [notice, dismissNotice]);

  const merchantOptions = useMemo(
    () => merchantList.map((m) => ({ value: m.id, label: m.name })),
    [merchantList],
  );
  const courierOptions = useMemo(
    () => courierList.map((c) => ({ value: c.id, label: c.displayName })),
    [courierList],
  );
  const couponOptions = useMemo(
    () => [
      { value: NO_COUPON, label: "بدون كوبون" },
      ...couponList.map((c) => ({
        value: c.id,
        label: c.code,
        hint: couponTypeLabel(c.couponType),
      })),
    ],
    [couponList],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    await submit({
      merchantName: pickLabel(
        merchantList,
        form.merchantId,
        (row) => row.name,
        "تاجر",
      ),
      courierName: pickLabel(
        courierList,
        form.courierId,
        (row) => row.displayName,
        "مندوب",
      ),
      couponCode:
        form.couponId && form.couponId !== NO_COUPON
          ? pickLabel(couponList, form.couponId, (row) => row.code, "")
          : "",
    });
  }

  return (
    <div className="operation-log">
      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>تسجيل طلب منفذ</h2>
            <span className="muted">
              أدخل بيانات الطلب كما تظهر في نقطة البيع. تُحسب المستحقات آلياً.
            </span>
          </div>
          {canImport ? (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setImportOpen(true)}
            >
              استيراد ملف طلبات
            </Button>
          ) : null}
        </div>

        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <OperationLogFields
            form={form}
            set={set}
            merchantOptions={merchantOptions}
            courierOptions={courierOptions}
            couponOptions={couponOptions}
          />

          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "جارٍ التسجيل…" : "تسجيل العملية"}
            </Button>
          </div>
        </form>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>آخر الطلبات</h2>
          <span className="muted">{operations.length} طلب</span>
        </div>

        <OperationRecentList operations={operations} />
      </article>

      <OrderImportModal
        open={importOpen}
        merchants={merchantList}
        couriers={courierList}
        onClose={() => setImportOpen(false)}
        onImported={(message) => {
          setImportOpen(false);
          window.location.reload();
          void message;
        }}
      />

      {error ? (
        <div className="toast toast-error" role="alert" dir="rtl">
          <span>{error}</span>
          <Button
            size="sm"
            variant="ghost"
            className="toast-dismiss"
            aria-label="إغلاق التنبيه"
            onClick={dismissError}
          >
            ×
          </Button>
        </div>
      ) : null}

      {!error && notice ? (
        <div className="toast" role="status" dir="rtl">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
