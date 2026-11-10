"use client";

import { useEffect } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import type { Coupon } from "@/lib/coupons/types";

import { CouponFormModal } from "./coupon-form-modal";
import { CouponImportModal } from "./coupon-import-modal";
import { CouponsDirectory } from "./coupons-directory";
import { useCoupons } from "./use-coupons";

type CouponsIslandProps = {
  initialCoupons: Coupon[];
  canManage: boolean;
};

export function CouponsIsland({ initialCoupons, canManage }: CouponsIslandProps) {
  const state = useCoupons(initialCoupons);
  const { toast, dismissToast } = state;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <>
      <PageHeader
        eyebrow="المقاصة والعمليات"
        title="الكوبونات"
        description="كوبونات الخصم وقيمها وقواعد تمويلها، ورفع ملف CSV من لوحة التحكم."
        actions={
          canManage ? (
            <div className="row-actions">
              <Button variant="quiet" onClick={() => state.setImporting(true)}>
                استيراد CSV
              </Button>
              <Button variant="primary" onClick={() => state.setCreating(true)}>
                إضافة كوبون
              </Button>
            </div>
          ) : null
        }
      />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <CouponsDirectory
        rows={state.visible}
        filters={state.filters}
        canManage={canManage}
        onFilter={state.setFilter}
        onEdit={state.setEditing}
        onDelete={(coupon) => {
          if (
            window.confirm(
              `حذف الكوبون ${coupon.code}؟ لا يمكن التراجع عن هذا الإجراء.`,
            )
          ) {
            void state.remove(coupon);
          }
        }}
      />

      <CouponFormModal
        open={state.creating || state.editing !== null}
        coupon={state.editing}
        onClose={() => {
          state.setCreating(false);
          state.setEditing(null);
        }}
        onSaved={state.applySaved}
      />

      <CouponImportModal
        open={state.importing}
        onClose={() => state.setImporting(false)}
        onImported={(message) => {
          state.setImporting(false);
          void state.refresh();
          state.setToast(message);
        }}
      />

      {state.toast ? (
        <div className="toast" role="status">
          {state.toast}
        </div>
      ) : null}
    </>
  );
}
