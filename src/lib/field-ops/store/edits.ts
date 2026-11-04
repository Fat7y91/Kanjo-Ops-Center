import type { EditRequest } from "@/lib/field-ops/types";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";

export function listEditRequests(): EditRequest[] {
  return clone(getStore().editRequests).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function createEditRequest(
  merchantId: string,
  reason: string,
  actor: Actor,
): Promise<EditRequest> {
  const store = getStore();
  const merchant = await requireMerchant(merchantId);

  if (merchant.contractState === "signed_contract") {
    throw new FieldOpsError(
      "SIGNED_LOCKED",
      "لا يمكن تعديل عقود التوقيع عبر طلب مندوب.",
      423,
    );
  }
  if (merchant.contractState !== "final_contract") {
    throw new FieldOpsError(
      "NOT_LOCKED",
      "طلبات التعديل مخصصة للاتفاقيات النهائية فقط.",
      400,
    );
  }
  if (merchant.editUnlocked) {
    throw new FieldOpsError(
      "ALREADY_UNLOCKED",
      "هذا التاجر مفتوح بالفعل لتعديل معتمد.",
      409,
    );
  }
  if (
    store.editRequests.some(
      (request) =>
        request.merchantId === merchantId &&
        request.requestedBy === actor.id &&
        request.status === "pending",
    )
  ) {
    throw new FieldOpsError(
      "EDIT_PENDING",
      "يوجد طلب تعديل لهذا التاجر قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: EditRequest = {
    id: id("edit"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    requestedBy: actor.id,
    requestedByName: actor.name,
    reason: reason.trim(),
    status: "pending",
    createdAt: isoNow(),
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };

  store.editRequests.push(request);
  bump();
  return clone(request);
}

export async function decideEditRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): Promise<EditRequest> {
  const store = getStore();
  const request = store.editRequests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!request) {
    throw new FieldOpsError("EDIT_NOT_FOUND", "الطلب غير موجود.", 404);
  }
  if (request.status !== "pending") {
    throw new FieldOpsError(
      "EDIT_CLOSED",
      "تمت مراجعة طلب التعديل هذا بالفعل.",
      409,
    );
  }

  request.status = decision === "approve" ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedByName = actor.name;
  request.reviewedAt = isoNow();
  request.reviewNote = note.trim();

  if (decision === "approve") {
    await updateMerchantRow(request.merchantId, { editUnlocked: true });
  }

  bump();
  return clone(request);
}
