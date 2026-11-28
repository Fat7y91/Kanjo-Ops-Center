import {
  CUSTODY_ITEM_KEYS,
  CUSTODY_ITEM_LABEL,
  type CustodyItem,
  type CustodyItemKey,
  type Rider,
  type RiderCustodyReceipt,
  type RiderReceiptSummary,
} from "./types";

export const RIDER_COLUMNS =
  "id,rider_code,governorate_code,city_code,sequence_number,display_name,national_id,phone,work_area,active,created_at";
export const RECEIPT_SUMMARY_COLUMNS =
  "id,rider_id,custody_number,delivery_date,total_amount,status,created_at";
export const RECEIPT_COLUMNS =
  "id,rider_id,custody_number,delivery_date,handover_officer,items,cash_custody,total_amount,total_amount_words,status,notes,created_at";
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RiderRow = {
  id: string;
  rider_code: string | null;
  governorate_code: string | null;
  city_code: string | null;
  sequence_number: number | null;
  display_name: string;
  national_id: string | null;
  phone: string;
  work_area: string;
  active: boolean;
  created_at: string;
};

export type ReceiptSummaryRow = {
  id: string;
  rider_id: string;
  custody_number: string;
  delivery_date: string;
  total_amount: number | string;
  status: RiderReceiptSummary["status"];
  created_at: string;
};

export type ReceiptRow = ReceiptSummaryRow & {
  handover_officer: string;
  items: unknown;
  cash_custody: number | string;
  total_amount_words: string;
  notes: string;
};

export type LocationRow = {
  governorate_name: string;
  city_name: string;
  level: "governorate" | "city";
  alpha_code: string;
  numeric_code: string;
  starting_sequence: number;
};

export function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toReceiptSummary(row: ReceiptSummaryRow): RiderReceiptSummary {
  return {
    id: row.id,
    custodyNumber: row.custody_number,
    deliveryDate: row.delivery_date,
    totalAmount: asNumber(row.total_amount),
    status: row.status,
  };
}

export function toRider(
  row: RiderRow,
  receipts: readonly RiderReceiptSummary[],
): Rider {
  const ordered = [...receipts].sort((left, right) =>
    left.deliveryDate < right.deliveryDate ? 1 : -1,
  );
  return {
    id: row.id,
    riderCode: row.rider_code ?? "",
    governorateCode: row.governorate_code ?? "",
    cityCode: row.city_code ?? "",
    sequenceNumber: row.sequence_number ?? 0,
    fullName: row.display_name,
    nationalId: row.national_id ?? "",
    phone: row.phone ?? "",
    workArea: row.work_area ?? "",
    status: row.active ? "active" : "suspended",
    createdAt: row.created_at,
    activeCustody:
      ordered.find((receipt) => receipt.status === "active") ?? null,
    latestCustody: ordered[0] ?? null,
  };
}

function toItem(value: unknown): CustodyItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const key = CUSTODY_ITEM_KEYS.includes(raw.key as CustodyItemKey)
    ? (raw.key as CustodyItemKey)
    : "OTHER";
  const quantity = Math.max(0, Math.trunc(asNumber(raw.quantity as number)));
  const unitPrice = Math.max(0, asNumber(raw.unitPrice as number));
  return {
    key,
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label
        : CUSTODY_ITEM_LABEL[key],
    codePrefix:
      typeof raw.codePrefix === "string" && raw.codePrefix.trim()
        ? raw.codePrefix
        : null,
    serial: typeof raw.serial === "string" && raw.serial ? raw.serial : null,
    quantity,
    condition:
      typeof raw.condition === "string" && raw.condition.trim()
        ? raw.condition
        : "جديد",
    unitPrice,
    lineTotal: Math.max(
      0,
      asNumber((raw.lineTotal as number) ?? quantity * unitPrice),
    ),
  };
}

export function toItems(value: unknown): CustodyItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(toItem)
    .filter((item): item is CustodyItem => item !== null);
}

export function toReceipt(
  row: ReceiptRow,
  rider: RiderRow,
): RiderCustodyReceipt {
  return {
    id: row.id,
    riderId: row.rider_id,
    custodyNumber: row.custody_number,
    deliveryDate: row.delivery_date,
    handoverOfficer: row.handover_officer,
    items: toItems(row.items),
    cashCustody: asNumber(row.cash_custody),
    totalAmount: asNumber(row.total_amount),
    totalAmountWords: row.total_amount_words,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    rider: {
      id: rider.id,
      riderCode: rider.rider_code ?? "",
      fullName: rider.display_name,
      nationalId: rider.national_id ?? "",
      phone: rider.phone ?? "",
      workArea: rider.work_area ?? "",
      governorateCode: rider.governorate_code ?? "",
      cityCode: rider.city_code ?? "",
      sequenceNumber: rider.sequence_number ?? 0,
      status: rider.active ? "active" : "suspended",
    },
  };
}
