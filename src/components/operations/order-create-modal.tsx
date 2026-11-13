"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/field-ops/modal";
import type { SelectOption } from "@/components/ui/select-menus";

import { NO_COUPON, OperationLogFields } from "./operation-log-fields";
import type { FormState } from "./use-operation-form";

/** Manual order entry, opened from the "إضافة طلبات" menu. */
export function OrderCreateModal({
  open,
  form,
  set,
  busy,
  merchantOptions,
  courierOptions,
  couponOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  busy: boolean;
  merchantOptions: SelectOption<string>[];
  courierOptions: SelectOption<string>[];
  couponOptions: SelectOption<string>[];
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      open={open}
      eyebrow="الطلبات"
      title="تسجيل طلب منفذ"
      description="أدخل بيانات الطلب كما تظهر في نقطة البيع. تُحسب المستحقات آلياً."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        noValidate
      >
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
    </Modal>
  );
}

