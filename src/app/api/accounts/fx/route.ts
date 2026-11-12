import { NextResponse } from "next/server";

import { postFxTransfer } from "@/lib/accounts/fx-repository";
import { FX_TRANSFER_INPUT } from "@/lib/accounts/fx";
import { apiError, authorize } from "@/lib/auth/api";
import { admitReceipt, receiptObjectPath } from "@/lib/operations/receipt-upload";
import {
  removeTransactionReceipt,
  uploadTransactionReceipt,
} from "@/lib/operations/receipt-storage";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Posts a manual SAR→EGP transfer.
 *
 * Multipart so the receipt travels with the posting: the file is sniffed and
 * stored privately, then the SQL function posts one balanced entry that debits
 * the Egyptian bank and credits the Riyadh bank with the receipt attached.
 * Gated by `post_fx_transfer`, which is narrower than the treasury read tier.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("post_fx_transfer");
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

  const sarAmount = Number(form.get("sarAmount") ?? "");
  const egpAmount = Number(form.get("egpAmount") ?? "");
  const occurredAt = String(form.get("occurredAt") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();
  const receiptNo = String(form.get("receiptNo") ?? "").trim() || null;
  const file = form.get("file");

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

    const parsed = FX_TRANSFER_INPUT.safeParse({
      sarAmount,
      egpAmount,
      label,
      occurredAt,
      receiptNo,
      storagePath,
      mimeType,
      sizeBytes,
    });

    if (!parsed.success) {
      if (uploadedPath) await removeTransactionReceipt(uploadedPath);
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "بيانات التحويل غير صالحة.",
          code: "INVALID_FX_TRANSFER",
        },
        { status: 422 },
      );
    }

    const entryId = await postFxTransfer({
      sarAmountMinor: Math.round(parsed.data.sarAmount * 100),
      egpAmountMinor: Math.round(parsed.data.egpAmount * 100),
      label: parsed.data.label || "تحويل عملة",
      occurredAt: new Date(
        `${parsed.data.occurredAt.slice(0, 10)}T12:00:00.000Z`,
      ).toISOString(),
      actorId: session.user.id,
      receiptNo: parsed.data.receiptNo,
      storagePath: parsed.data.storagePath,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes ?? null,
    });

    return NextResponse.json({ entryId }, { status: 201 });
  } catch (error) {
    if (uploadedPath) await removeTransactionReceipt(uploadedPath);
    return apiError(error);
  }
}
