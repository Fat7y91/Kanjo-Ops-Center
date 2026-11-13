"use client";

import { useEffect, useMemo, useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { couponTypeLabel } from "@/lib/coupons/format";
import { pickLabel } from "@/lib/operations/optimistic";
import type {
  CourierOption,
  CouponOption,
  MerchantOption,
  OperationSummary,
} from "@/lib/operations/types";

import { OrderCreateModal } from "./order-create-modal";
import { OrderImportModal } from "./order-import-modal";
import { NO_COUPON } from "./operation-log-fields";
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
  const canDelete = hasPermission("delete_orders");

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const {
    form,
    set,
    submit,
    operations,
    error,
    notice,
    busy,
    removeOperations,
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

  async function handleSubmit() {
    if (busy) return;
    const saved = await submit({
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
    if (saved) setCreateOpen(false);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(operations.map((row) => row.id)) : new Set());
  }

  async function handleDelete(ids: string[]) {
    if (!canDelete || ids.length === 0) return;
    if (!window.confirm(`حذف ${ids.length} طلب من القائمة؟`)) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/operations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = (await response.json()) as { deleted?: number; error?: string };
      if (!response.ok || typeof payload.deleted !== "number") {
        setDeleteError(payload.error ?? "تعذر حذف الطلبات.");
        return;
      }
      removeOperations(ids);
      setSelected((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
    } catch {
      setDeleteError("تعذر الاتصال بالخادم.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="operation-log">
      <article className="panel">
        <div className="panel-head">
          <div>
            <h2>الطلبات</h2>
            <span className="muted">{operations.length} طلب</span>
          </div>
          <DropdownMenu
            label="إضافة طلبات +"
            items={[
              {
                id: "new-order",
                label: "طلب جديد",
                onSelect: () => setCreateOpen(true),
              },
              {
                id: "import-orders",
                label: "استيراد ملف CSV",
                onSelect: () => setImportOpen(true),
                disabled: !canImport,
              },
            ]}
          />
        </div>

        <OperationRecentList
          operations={operations}
          canDelete={canDelete}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onDelete={handleDelete}
          deleting={deleting}
        />
      </article>

      <OrderCreateModal
        open={createOpen}
        form={form}
        set={set}
        busy={busy}
        merchantOptions={merchantOptions}
        courierOptions={courierOptions}
        couponOptions={couponOptions}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleSubmit}
      />

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

      {deleteError ? (
        <div className="toast toast-error" role="alert" dir="rtl">
          <span>{deleteError}</span>
          <Button
            size="sm"
            variant="ghost"
            className="toast-dismiss"
            aria-label="إغلاق التنبيه"
            onClick={() => setDeleteError("")}
          >
            ×
          </Button>
        </div>
      ) : null}

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
