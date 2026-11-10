"use client";

import { useEffect } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import type { Courier } from "@/lib/couriers/types";

import { CourierDetailsModal } from "./courier-details-modal";
import { CourierFormModal } from "./courier-form-modal";
import { CouriersDirectory } from "./couriers-directory";
import { useCouriers } from "./use-couriers";

type CouriersIslandProps = {
  initialCouriers: Courier[];
  canManage: boolean;
};

export function CouriersIsland({ initialCouriers, canManage }: CouriersIslandProps) {
  const state = useCouriers(initialCouriers);

  const { toast, dismissToast } = state;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  function edit(courier: Courier) {
    state.setEditing(courier);
    state.setViewing(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="المقاصة والعمليات"
        title="المناديب"
        description="شركاء التوصيل وربحهم الثابت وبيانات صرفهم وأرصدتهم."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => state.setCreating(true)}>
              إضافة شريك توصيل
            </Button>
          ) : null
        }
      />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <CouriersDirectory
        rows={state.visible}
        filters={state.filters}
        canManage={canManage}
        onFilter={state.setFilter}
        onView={state.setViewing}
        onEdit={state.setEditing}
        onDelete={(courier) => {
          if (
            window.confirm(
              `حذف المندوب ${courier.displayName}؟ لا يمكن التراجع عن هذا الإجراء.`,
            )
          ) {
            void state.remove(courier);
          }
        }}
      />

      <CourierFormModal
        open={state.creating || state.editing !== null}
        courier={state.editing}
        onClose={() => {
          state.setCreating(false);
          state.setEditing(null);
        }}
        onSaved={state.applySaved}
      />

      <CourierDetailsModal
        courier={state.viewing}
        canManage={canManage}
        onClose={() => state.setViewing(null)}
        onEdit={edit}
      />

      {state.toast ? (
        <div className="toast" role="status">
          {state.toast}
        </div>
      ) : null}
    </>
  );
}
