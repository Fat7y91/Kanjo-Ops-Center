import "server-only";

import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { RidersError } from "./errors";
import {
  RECEIPT_COLUMNS,
  RIDER_COLUMNS,
  UUID_PATTERN,
  toReceipt,
  type ReceiptRow,
  type RiderRow,
} from "./rows";
import type { IssueCustodyInput } from "./schema";
import { tafqeetEGP } from "./tafqeet";
import {
  custodyTotal,
  itemsTotal,
  normalizeItems,
} from "./totals";
import type {
  CustodyIssueResult,
  CustodyItemDraft,
  RiderCustodyReceipt,
  RiderLookup,
} from "./types";

const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  INVALID_SEQUENCE: { status: 400, message: "رقم التسلسل غير صالح." },
  INVALID_NATIONAL_ID: {
    status: 400,
    message: "الرقم القومي يجب أن يكون 14 رقماً.",
  },
  INVALID_ITEMS: { status: 400, message: "بنود العهدة غير صالحة." },
  NAME_REQUIRED: { status: 400, message: "اسم المندوب مطلوب." },
  PHONE_TAKEN: {
    status: 409,
    message: "رقم الهاتف مسجل لمندوب آخر، راجع سجل المناديب.",
  },
  LOCATION_NOT_FOUND: {
    status: 400,
    message: "المحافظة أو المدينة غير مسجلة.",
  },
  TOTAL_MISMATCH: {
    status: 400,
    message: "الإجمالي لا يطابق البنود والعهدة النقدية.",
  },
  RIDER_INACTIVE: {
    status: 409,
    message: "المندوب غير نشط ولا يمكن إصدار عهدة له.",
  },
  RIDER_LOCATION_MISMATCH: {
    status: 409,
    message: "المندوب مسجل في محافظة أو مدينة أخرى.",
  },
  RIDER_ALREADY_HAS_CUSTODY: {
    status: 409,
    message: "المندوب لديه عهدة مسجلة بالفعل.",
  },
  RIDER_NOT_FOUND: {
    status: 404,
    message: "المندوب غير مسجل.",
  },
  RIDER_ALREADY_EXISTS: {
    status: 409,
    message: "الرقم القومي مسجل لمندوب آخر، استخدم خيار المندوب الحالي.",
  },
  SEQUENCE_TAKEN: {
    status: 409,
    message: "رقم التسلسل مستخدم بالفعل، اختر الرقم التالي.",
  },
  INVALID_RECEIPT_SEQUENCE: {
    status: 400,
    message: "رقم تسلسل الإيصال غير صالح.",
  },
  RECEIPT_SEQUENCE_TAKEN: {
    status: 409,
    message: "رقم تسلسل الإيصال مستخدم بالفعل، اختر رقماً آخر.",
  },
  CUSTODY_NUMBER_TAKEN: {
    status: 409,
    message: "رقم إيصال العهدة مستخدم بالفعل.",
  },
};

function rpcError(error: unknown): RidersError {
  if (isMissingSchemaObject(error)) {
    return new RidersError(
      "STORE_UNAVAILABLE",
      "خدمة العهد غير متاحة حالياً. حاول لاحقاً.",
      503,
    );
  }
  if (isUniqueViolation(error)) {
    return new RidersError(
      "SEQUENCE_TAKEN",
      "رقم التسلسل أو الإيصال مستخدم بالفعل.",
      409,
    );
  }

  const message =
    typeof error === "object" && error !== null
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const code = Object.keys(RPC_ERRORS).find((key) => message.includes(key));
  if (!code) {
    return new RidersError(
      "RIDERS_FAILED",
      "تعذر إصدار إيصال العهدة.",
      502,
    );
  }
  const mapped = RPC_ERRORS[code];
  return new RidersError(code, mapped.message, mapped.status);
}

export async function getRiderCustodyReceipt(
  receiptId: string,
): Promise<RiderCustodyReceipt | null> {
  if (!UUID_PATTERN.test(receiptId)) return null;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("rider_custody_receipts")
    .select(RECEIPT_COLUMNS)
    .eq("id", receiptId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;

  const receipt = data as unknown as ReceiptRow;
  const { data: riderData, error: riderError } = await client
    .schema("app")
    .from("couriers")
    .select(RIDER_COLUMNS)
    .eq("id", receipt.rider_id)
    .maybeSingle();

  if (riderError) {
    if (isMissingSchemaObject(riderError)) return null;
    throw riderError;
  }
  if (!riderData) return null;
  return toReceipt(receipt, riderData as unknown as RiderRow);
}

export async function findRiderByNationalId(
  nationalId: string,
): Promise<RiderLookup | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select(RIDER_COLUMNS)
    .eq("national_id", nationalId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;

  const rider = data as unknown as RiderRow;
  const { data: receipts, error: receiptsError } = await client
    .schema("app")
    .from("rider_custody_receipts")
    .select("id,status,delivery_date")
    .eq("rider_id", rider.id)
    .order("delivery_date", { ascending: false });

  if (receiptsError && !isMissingSchemaObject(receiptsError)) {
    throw receiptsError;
  }
  const rows = (receipts ?? []) as unknown as {
    id: string;
    status: string;
  }[];
  const active = rows.find((row) => row.status === "active") ?? rows[0] ?? null;

  return {
    id: rider.id,
    riderCode: rider.rider_code ?? "",
    governorateCode: rider.governorate_code ?? "",
    cityCode: rider.city_code ?? "",
    sequenceNumber: rider.sequence_number ?? 0,
    fullName: rider.display_name,
    phone: rider.phone ?? "",
    workArea: rider.work_area ?? "",
    status: rider.active ? "active" : "suspended",
    hasCustody: rows.length > 0,
    custodyId: active?.id ?? null,
  };
}

export async function issueCustody(
  input: IssueCustodyInput,
  createdBy: string | null,
): Promise<CustodyIssueResult> {
  const drafts: CustodyItemDraft[] = input.items.map((item) => ({
    key: item.key,
    label: item.label ?? "",
    codePrefix: item.codePrefix ?? null,
    quantity: item.quantity,
    condition: item.condition,
    unitPrice: item.unitPrice,
    serial: item.serial ?? null,
  }));
  const items = normalizeItems(drafts);
  const total = custodyTotal(items, input.cashCustody);

  if (
    input.totalAmount !== undefined &&
    Math.abs(total - input.totalAmount) > 0.005
  ) {
    throw new RidersError(
      "TOTAL_MISMATCH",
      "الإجمالي لا يطابق البنود والعهدة النقدية.",
      400,
    );
  }
  if (itemsTotal(items) + input.cashCustody <= 0) {
    throw new RidersError(
      "INVALID_ITEMS",
      "أضف بنداً واحداً على الأقل أو عهدة نقدية.",
      400,
    );
  }

  const payload = items.map((item) => ({
    key: item.key,
    label: item.label,
    codePrefix: item.codePrefix,
    quantity: item.quantity,
    condition: item.condition,
    unitPrice: item.unitPrice,
    serial: item.serial,
  }));

  const existingRider = input.riderMode === "existing";

  const client = getSupabaseServerClient();
  const { data, error } = await client.schema("app").rpc("issue_rider_custody", {
    p_rider_id: existingRider ? input.riderId ?? null : null,
    p_governorate: input.governorate,
    p_city: input.city,
    p_sequence: input.sequence ?? null,
    p_receipt_sequence: input.receiptSequence ?? null,
    p_full_name: input.fullName,
    p_national_id: input.nationalId || null,
    p_phone: input.phone,
    p_work_area: input.workArea,
    p_delivery_date: input.deliveryDate,
    p_handover_officer: input.handoverOfficer,
    p_items: payload,
    p_cash_custody: input.cashCustody,
    p_total_amount: total,
    p_total_amount_words: tafqeetEGP(total),
    p_notes: input.notes,
    p_created_by: createdBy,
  });

  if (error) throw rpcError(error);

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        rider_id?: string;
        receipt_id?: string;
        rider_code?: string;
        custody_number?: string;
      }
    | null;
  if (!row?.rider_id || !row.receipt_id) {
    throw new RidersError(
      "RIDERS_FAILED",
      "تعذر إصدار إيصال العهدة.",
      502,
    );
  }

  return {
    riderId: row.rider_id,
    receiptId: row.receipt_id,
    riderCode: row.rider_code ?? "",
    custodyNumber: row.custody_number ?? "",
  };
}
