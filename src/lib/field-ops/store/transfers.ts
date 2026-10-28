import type { TransferRequest } from "@/lib/field-ops/types";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";

export function listTransferRequests(): TransferRequest[] {
  return clone(getStore().transferRequests).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function createTransferRequest(
  merchantId: string,
  justification: string,
  actor: Actor,
): TransferRequest {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (!merchant.team) {
    throw new FieldOpsError(
      "MERCHANT_UNASSIGNED",
      "هذا التاجر غير مسند لأي فريق بعد. أسنده إلى فريق أولاً.",
      409,
    );
  }
  if (merchant.team === actor.team) {
    throw new FieldOpsError(
      "SAME_TEAM",
      "هذا التاجر تابع لفريقك بالفعل.",
      400,
    );
  }
  if (
    store.transferRequests.some(
      (request) =>
        request.merchantId === merchantId &&
        request.requestedBy === actor.id &&
        request.status === "pending",
    )
  ) {
    throw new FieldOpsError(
      "TRANSFER_PENDING",
      "يوجد طلب نقل لهذا التاجر قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: TransferRequest = {
    id: id("transfer"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    fromTeam: merchant.team,
    toTeam: actor.team,
    requestedBy: actor.id,
    requestedByName: actor.name,
    justification: justification.trim(),
    status: "pending",
    createdAt: isoNow(),
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };

  store.transferRequests.push(request);
  bump();
  return clone(request);
}

export function decideTransferRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): TransferRequest {
  const store = getStore();
  const request = store.transferRequests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!request) {
    throw new FieldOpsError("TRANSFER_NOT_FOUND", "الطلب غير موجود.", 404);
  }
  if (request.status !== "pending") {
    throw new FieldOpsError(
      "TRANSFER_CLOSED",
      "تمت مراجعة طلب النقل هذا بالفعل.",
      409,
    );
  }

  request.status = decision === "approve" ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedByName = actor.name;
  request.reviewedAt = isoNow();
  request.reviewNote = note.trim();

  if (decision === "approve") {
    const merchant = store.merchants.find(
      (candidate) => candidate.id === request.merchantId,
    );
    if (merchant) {
      merchant.team = request.toTeam;
      merchant.updatedAt = isoNow();
      store.tasks.forEach((task) => {
        if (
          task.merchantId === merchant.id &&
          task.status === "scheduled"
        ) {
          task.team = request.toTeam;
        }
      });
    }
  }

  bump();
  return clone(request);
}
