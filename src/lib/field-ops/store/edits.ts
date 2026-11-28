import type { EditRequest } from "@/lib/field-ops/types";

import { FieldOpsError, id, isoNow, type Actor } from "./core";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";
import {
  decideEditRow,
  getEditRow,
  insertEdit,
  isRequestsDatabaseConfigured,
  listEditRows,
} from "../request-repository";

/**
 * Report-edit requests, backed by `app.edit_requests`.
 *
 * A rep cannot unlock a final agreement alone; they ask, a manager decides, and
 * the decision is durable. Keeping the request in a process-local array meant
 * the proof could vanish while the merchant stayed unlocked.
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

export async function listEditRequests(): Promise<EditRequest[]> {
  return listEditRows();
}

export async function createEditRequest(
  merchantId: string,
  reason: string,
  actor: Actor,
): Promise<EditRequest> {
  requireDatabase();
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

  const open = (await listEditRows()).find(
    (request) =>
      request.merchantId === merchantId &&
      request.requestedBy === actor.id &&
      request.status === "pending",
  );
  if (open) {
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

  return insertEdit(request);
}

export async function decideEditRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): Promise<EditRequest> {
  requireDatabase();
  const request = await getEditRow(requestId);
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

  const saved = await decideEditRow(requestId, {
    status: decision === "approve" ? "approved" : "rejected",
    reviewedBy: actor.id,
    reviewedByName: actor.name,
    reviewedAt: isoNow(),
    reviewNote: note.trim(),
  });
  if (!saved) {
    throw new FieldOpsError("EDIT_NOT_FOUND", "الطلب غير موجود.", 404);
  }

  if (decision === "approve") {
    await updateMerchantRow(request.merchantId, { editUnlocked: true });
  }

  return saved;
}
