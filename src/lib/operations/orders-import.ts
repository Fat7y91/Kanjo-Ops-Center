import type { PaymentMethod } from "./types";

/**
 * Pure mapping for the bulk orders CSV import.
 *
 * The PO's export does not use the app's column names, and its payment labels
 * are free text, so the raw file cannot be inserted directly. This module turns
 * one CSV record into a candidate order against the live roster, and reports a
 * precise issue for every row it cannot place. It is side-effect free, so the
 * client preview and the server write run the exact same rules.
 */

export type ImportRoster = {
  /** Merchant name (as shown) → merchant id. */
  merchants: Map<string, string>;
  /** Courier display name (as shown) → courier id. */
  couriers: Map<string, string>;
};

export type ImportCandidate = {
  line: number;
  orderId: string;
  merchantId: string;
  merchantName: string;
  courierId: string;
  courierName: string;
  paymentMethod: PaymentMethod;
  currency: "EGP" | "SAR";
  orderValue: number;
  /**
   * The delivery fee charged on the order. The courier's own share is never
   * imported: it is derived from the courier's fixed profit by the posting
   * trigger, so the file cannot dictate a financial split.
   */
  deliveryFee: number;
  note: string;
  occurredAt: string;
};

export type ImportIssue = {
  line: number;
  message: string;
};

export type ImportPlan = {
  candidates: ImportCandidate[];
  issues: ImportIssue[];
  /** Order ids already used in the file, so the first occurrence wins. */
  duplicates: ImportIssue[];
  /**
   * Courier display names referenced by the file but absent from the roster.
   * The preview offers to create them; the server only writes them when the
   * operator confirms.
   */
  missingCouriers: string[];
};

export type ImportOptions = {
  /**
   * Collect unknown couriers into `missingCouriers` and keep their orders as
   * candidates with an empty `courierId`. Used by the preview and by the server
   * once the operator has confirmed creation; the final write always runs again
   * with this off so every row is re-validated against the real roster.
   */
  createMissingCouriers?: boolean;
};

export {
  normalizeDigits,
  matchKey,
  field,
  parseAmount,
  parseFee,
} from "@/lib/import/csv";

import { clean, field, matchKey, normalizeDigits, parseAmount, parseFee } from "@/lib/import/csv";

const COD_LABELS = [
  "cod",
  "cash",
  "cashondelivery",
  "cash on delivery",
  "الدفععندالاستلام",
  "عندالاستلام",
  "تحصيلعندالتسليم",
  "كاش",
];
const ONLINE_LABELS = [
  "online",
  "card",
  "creditcard",
  "visa",
  "mastercard",
  "مدفوعأونلاين",
  "اونلاين",
  "أونلاين",
  "بطاقة",
  "دفعإلكتروني",
  "الكتروني",
];

/**
 * Normalises the free-text payment method. Anything not recognisable is null,
 * so an unknown label is reported rather than silently treated as cash.
 */
export function parsePaymentMethod(value: unknown): PaymentMethod | null {
  const key = matchKey(clean(value)).replace(/[\s_-]/g, "");
  if (key === "") return null;
  if (COD_LABELS.some((label) => label.replace(/[\s_-]/g, "") === key)) {
    return "COD";
  }
  if (ONLINE_LABELS.some((label) => label.replace(/[\s_-]/g, "") === key)) {
    return "ONLINE";
  }
  return null;
}

const DATE_HEADERS = [
  "date",
  "order_date",
  "created_at",
  "occurred_at",
  "التاريخ",
  "تاريخ الطلب",
];

function parseDate(value: unknown): string | null {
  const text = normalizeDigits(clean(value));
  if (text === "") return null;
  // Accept `YYYY-MM-DD`, `DD/MM/YYYY` and anything Date can parse. A date that
  // cannot be read is reported so the row is not stamped with import time.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmY) {
    const day = dmY[1].padStart(2, "0");
    const month = dmY[2].padStart(2, "0");
    return `${dmY[3]}-${month}-${day}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function currencyOf(value: unknown): "EGP" | "SAR" {
  const key = matchKey(clean(value));
  return key === "sar" || key.includes("ريال") || key.includes("سعود") ? "SAR" : "EGP";
}

/**
 * Maps raw CSV records to import candidates.
 *
 * `line` is the 1-based data line (the header is line 1), so an operator can
 * find the offending row in the spreadsheet they uploaded.
 */
export function planImport(
  rows: readonly Record<string, unknown>[],
  roster: ImportRoster,
  options: ImportOptions = {},
): ImportPlan {
  const candidates: ImportCandidate[] = [];
  const issues: ImportIssue[] = [];
  const duplicates: ImportIssue[] = [];
  const seen = new Set<string>();
  const missing = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const orderId = clean(
      field(row, "order_id", "orderId", "order_number", "orderNumber", "id", "رقم الطلب", "الطلب"),
    );
    if (orderId === "") {
      issues.push({ line, message: "معرّف الطلب مفقود." });
      return;
    }

    if (seen.has(orderId)) {
      duplicates.push({ line, message: `معرّف الطلب مكرر داخل الملف: ${orderId}.` });
      return;
    }

    const merchantName = clean(
      field(row, "vendor", "vendor_name", "merchant", "merchant_name", "merchantName", "التاجر", "اسم التاجر"),
    );
    const courierName = clean(
      field(row, "delivery_partner", "deliveryPartner", "courier", "courier_name", "courierName", "المندوب", "اسم المندوب"),
    );
    const merchantId = roster.merchants.get(matchKey(merchantName));
    const courierId = roster.couriers.get(matchKey(courierName));

    if (!merchantId) {
      issues.push({
        line,
        message: merchantName
          ? `تاجر غير معروف: ${merchantName}.`
          : "اسم التاجر مفقود.",
      });
      return;
    }
    if (!courierId && courierName === "") {
      issues.push({ line, message: "اسم مندوب التوصيل مفقود." });
      return;
    }
    if (!courierId && !options.createMissingCouriers) {
      issues.push({
        line,
        message: `مندوب توصيل غير معروف: ${courierName}.`,
      });
      return;
    }
    if (!courierId) {
      missing.add(courierName);
    }

    const orderValue = parseAmount(
      field(row, "total", "order_total", "orderTotal", "amount", "order_value", "orderValue", "الإجمالي", "القيمة"),
    );
    if (orderValue === null) {
      issues.push({ line, message: "إجمالي الطلب مفقود أو غير صالح." });
      return;
    }

    const paymentMethod = parsePaymentMethod(
      field(row, "payment_method", "paymentMethod", "payment", "طريقة الدفع"),
    );
    if (!paymentMethod) {
      issues.push({ line, message: "طريقة الدفع غير معروفة." });
      return;
    }

    const deliveryFee = parseFee(
      field(row, "courier_fee", "courierFee", "delivery_fee", "deliveryFee", "أجر التوصيل"),
    );
    const occurredAt = parseDate(field(row, ...DATE_HEADERS));
    if (occurredAt === null) {
      issues.push({ line, message: "تاريخ الطلب مفقود أو غير صالح." });
      return;
    }

    seen.add(orderId);
    candidates.push({
      line,
      orderId,
      merchantId,
      merchantName,
      courierId: courierId ?? "",
      courierName,
      paymentMethod,
      currency: currencyOf(field(row, "currency", "العملة")),
      orderValue,
      deliveryFee,
      note: clean(field(row, "note", "notes", "ملاحظات")),
      occurredAt,
    });
  });

  return { candidates, issues, duplicates, missingCouriers: [...missing] };
}
