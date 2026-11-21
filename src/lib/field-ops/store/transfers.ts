import type { TransferRequest } from "@/lib/field-ops/types";

import { FieldOpsError, id, isoNow, type Actor } from "./core";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";
import { reassignTasksForMerchant } from "../task-repository";
import {
  decideTransferRow,
  getTransferRow,
  insertTransfer,
  isRequestsDatabaseConfigured,
  listTransferRows,
} from "../request-repository";

/**
 * Merchant ownership transfer requests, backed by `app.transfer_requests`.
 *
 * A transfer is a governance record: the rep asked, a manager decided. Keeping
 * it in a process-local array meant the proof of the request could disappear on
 * the next request while the merchant's team had already changed.
 */

function requireDatabase(): void {
  if (!isRequestsDatabaseConfigured()) {
    throw new FieldOpsError(
      "REQUESTS_UNAVAILABLE",
      "قاعدة بيانات الطلبات غير متصلة.",
      503,
    );
  }
}

export async function listTransferRequests(): Promise<TransferRequest[]> {
  return listTransferRows();
}

export async function createTransferRequest(
  merchantId: string,
  justification: string,
  actor: Actor,
): Promise<TransferRequest> {
  requireDatabase();
  const merchant = await requireMerchant(merchantId);

  if (!merchant.team) {
    throw new FieldOpsError(
      "MERCHANT_UNASSIGNED",
      "هذا التاجر غير مسند لأي فريق بعد. أسنده إلى فريق أولاً.",
      409,
    );
  }
  if (merchant.team === actor.team) {
    throw new FieldOpsError("SAME_TEAM", "هذا التاجر تابع لفريقك بالفعل.", 400);
  }

  const open = (await listTransferRows()).find(
    (request) =>
      request.merchantId === merchantId &&
      request.requestedBy === actor.id &&
      request.status === "pending",
  );
  if (open) {
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

  return insertTransfer(request);
}

export async function decideTransferRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): Promise<TransferRequest> {
  requireDatabase();
  const request = await getTransferRow(requestId);
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

  const saved = await decideTransferRow(requestId, {
    status: decision === "approve" ? "approved" : "rejected",
    reviewedBy: actor.id,
    reviewedByName: actor.name,
    reviewedAt: isoNow(),
    reviewNote: note.trim(),
  });
  if (!saved) {
    throw new FieldOpsError("TRANSFER_NOT_FOUND", "الطلب غير موجود.", 404);
  }

  if (decision === "approve") {
    await updateMerchantRow(request.merchantId, { team: request.toTeam });
    await reassignTasksForMerchant(request.merchantId, request.toTeam);
  }

  return saved;
}
