import { NextResponse } from "next/server";

import { apiError, authorize, authorizeAny } from "@/lib/auth/api";
import {
  loadClearinghouse,
  settleClearingAccount,
} from "@/lib/operations/service";
import { admitReceipt, receiptObjectPath } from "@/lib/operations/receipt-upload";
import {
  removeTransactionReceipt,
  uploadTransactionReceipt,
} from "@/lib/operations/receipt-storage";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Clearinghouse book: party ledger balances derived from the journal. */
export async function GET() {
  const { session, response } = await authorizeAny([
    "view_clearinghouse",
    "settle_clearinghouse",
  ]);
  if (!session) return response;

  try {
    const board = await loadClearinghouse();
    return NextResponse.json(board, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Settles one party account, optionally attaching a receipt.
 *
 * Multipart so the proof travels with the decision in one request: the file is
 * sniffed and stored privately, then the SQL function posts a balanced entry
 * that zeroes the account and records the receipt against that entry. Gated by
 * `settle_clearinghouse`, deliberately distinct from `view_clearinghouse`.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("settle_clearinghouse");
  if (!session) return response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  const accountId = String(form.get("accountId") ?? "").trim();
  if (accountId === "") {
    return NextResponse.json({ error: "معرّف الحساب مطلوب." }, { status: 422 });
  }

  const receiptNo = String(form.get("receiptNo") ?? "").trim() || null;
  const file = form.get("file");

  /* A stored file is only referenced when a receipt number is present, so
   * reject the combination that would leave an orphaned object in the bucket. */
  if (file instanceof File && !receiptNo) {
    return NextResponse.json(
      { error: "أدخل رقم الإيصال لإرفاق ملف.", code: "RECEIPT_NO_REQUIRED" },
      { status: 422 },
    );
  }

  let uploadedPath: string | null = null;

  try {
    let storagePath: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;

    if (file instanceof File) {
      const admission = await admitReceipt(file);
      storagePath = receiptObjectPath(admission.extension);
      await uploadTransactionReceipt(
        storagePath,
        new Blob([admission.bytes], { type: admission.mime }),
        admission.mime,
      );
      uploadedPath = storagePath;
      mimeType = admission.mime;
      sizeBytes = file.size;
    }

    const entryId = await settleClearingAccount(accountId, session.user.id, {
      receiptNo,
      storagePath,
      mimeType,
      sizeBytes,
    });
    return NextResponse.json({ entryId });
  } catch (error) {
    // The settlement failed after the file landed: remove the now-orphaned
    // object so the bucket does not accumulate unreferenced receipts.
    if (uploadedPath) await removeTransactionReceipt(uploadedPath);
    return apiError(error);
  }
}
