import type { ContractStatus } from "./types";

/**
 * Signed-contract governance rules, kept pure so the table, the dialog and the
 * tests all agree on which action is offered and why.
 *
 * A terminal contract (signed/cancelled) is no longer frozen: an operator with
 * `manage_signed_contracts` may amend its headline rate, reopen it, or terminate
 * it. A permanent delete is narrower still — it also needs `delete_contracts`
 * and must not orphan a merchant that already has orders under the contract.
 */

export type ContractGovernanceAction =
  | "amend"
  | "reopen"
  | "terminate"
  | "delete";

export type ContractGovernanceCapabilities = {
  manageSigned: boolean;
  deleteContracts: boolean;
  editFinalized: boolean;
};

export type ContractGovernanceItem = {
  action: ContractGovernanceAction;
  label: string;
  description: string;
  tone: "default" | "danger";
  enabled: boolean;
  /** Arabic explanation shown when the item is offered but cannot run. */
  hint?: string;
};

export const ORDER_DELETE_BLOCKED_HINT =
  "هذا العقد مرتبط بطلبات مسجّلة، لذا لا يمكن حذفه نهائياً. يمكنك تعديل نسبة العمولة أو إنهاء العقد بدلاً من الحذف.";

export function isTerminalContractStatus(status: ContractStatus): boolean {
  return status === "signed" || status === "cancelled";
}

export function canDeleteContract(args: {
  hasDeletePermission: boolean;
  orderCount: number;
}): boolean {
  return args.hasDeletePermission && args.orderCount === 0;
}

export function contractGovernanceItems(args: {
  status: ContractStatus;
  orderCount: number;
  caps: ContractGovernanceCapabilities;
}): ContractGovernanceItem[] {
  const { status, orderCount, caps } = args;
  if (!isTerminalContractStatus(status)) return [];

  const items: ContractGovernanceItem[] = [];

  if (status === "signed" && (caps.manageSigned || caps.editFinalized)) {
    items.push({
      action: "amend",
      label: "تعديل نسبة العمولة",
      description:
        "حدّث نسبة العمولة المتفق عليها في العقد وملف التاجر معاً، مع الحفاظ على القيود المحاسبية المرحّلة.",
      tone: "default",
      enabled: true,
    });
  }

  if (caps.manageSigned) {
    items.push({
      action: "reopen",
      label: "إعادة فتح العقد",
      description:
        "أعد العقد إلى حالة مسودة لمراجعة شروطه، مع إرجاع ملف التاجر إلى اتفاق نهائي.",
      tone: "default",
      enabled: true,
    });
  }

  if (status === "signed" && (caps.manageSigned || caps.deleteContracts)) {
    items.push({
      action: "terminate",
      label: "إنهاء العقد",
      description:
        "أنهِ العقد الموقّع وأعد حالة التاجر إلى بدون اتفاق، مع حفظ سجل التدقيق.",
      tone: "danger",
      enabled: true,
    });
  }

  if (caps.deleteContracts) {
    const allowed = canDeleteContract({
      hasDeletePermission: caps.deleteContracts,
      orderCount,
    });
    items.push({
      action: "delete",
      label: "حذف العقد نهائياً",
      description:
        "احذف سجل العقد نهائياً. متاح فقط عندما لا يكون للتاجر طلبات على العقد.",
      tone: "danger",
      enabled: allowed,
      hint: allowed ? undefined : ORDER_DELETE_BLOCKED_HINT,
    });
  }

  return items;
}
