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
  /**
   * Merchant goods value (subtotal). This is the commission base, not the cash
   * the customer paid: discounts and shipping are tracked separately.
   */
  orderValue: number;
  /**
   * Shipping charged to the customer (`shipping_cost`), falling back to
   * `courier_fee` for legacy exports that only carry one fee column.
   */
  deliveryFee: number;
  /** The courier's own earning for the order (`courier_fee`). */
  courierFee: number;
  /**
   * True when the row carries raw settlement columns (`cod_collected_total`
   * or `subtotal`). Settlement-driven rows post a dedicated, balanced COD
   * journal from these raw amounts instead of the legacy rate-only entry.
   */
  settlementDriven: boolean;
  subtotal: number;
  discount: number;
  rewardDiscount: number;
  shippingDiscount: number;
  tip: number;
  walletAmount: number;
  /** `subtotal − discounts + shipping + tip`, recomputed, never trusted. */
  expectedTotal: number;
  /** `expectedTotal − walletAmount`. */
  amountDue: number;
  /** Cash actually collected on delivery; defaults to `amountDue`. */
  codCollected: number;
  /**
   * Signed platform position: `codCollected − subtotal − courierFee`.
   * Positive means the platform is owed; negative means it owes. Never clamped.
   */
  netDuePlatform: number;
  /** Signed cash the courier must remit: `codCollected − courierFee − tip`. */
  courierRemittance: number;
  /** Delivery timestamp when the export carries one, else `occurredAt`. */
  deliveredAt: string;
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

const DELIVERED_HEADERS = [
  "delivered_at",
  "deliveredAt",
  "delivery_date",
  "deliveryDate",
  "تاريخ التسليم",
];

/** Rounds a major-unit money value to two decimals without float drift. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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
      field(row, "vendor", "vendors", "vendor_name", "merchant", "merchant_name", "merchantName", "التاجر", "اسم التاجر"),
    );
    if (merchantName.includes(",")) {
      issues.push({
        line,
        message: `طلب متعدد التجار (رقم ${orderId}): يجب إضافته يدوياً.`,
      });
      return;
    }
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
    if (!courierId) {
      // Collected even while the preview is still strict: the checkbox is
      // offered so the operator can turn these rows into valid ones, and one
      // bad row earlier in the file must not hide that affordance.
      missing.add(courierName);
      if (!options.createMissingCouriers) {
        issues.push({
          line,
          message: `مندوب توصيل غير معروف: ${courierName}.`,
        });
        return;
      }
    }

    const subtotalRaw = field(
      row,
      "subtotal",
      "sub_total",
      "subTotal",
      "goods_total",
      "goodsValue",
      "قيمة السلع",
      "الإجمالي الفرعي",
    );
    const totalRaw = field(row, "total", "order_total", "orderTotal", "amount", "order_value", "orderValue", "الإجمالي", "القيمة");

    const discount = parseFee(field(row, "discount_amount", "discountAmount", "discount", "الخصم"));
    const rewardDiscount = parseFee(
      field(row, "reward_discount_amount", "rewardDiscountAmount", "reward_discount", "خصم المكافآت"),
    );
    const shippingDiscount = parseFee(
      field(row, "shipping_discount", "shippingDiscount", "خصم الشحن"),
    );
    const tip = parseFee(field(row, "tip", "tip_amount", "tipAmount", "البقشيش"));
    const walletAmount = parseFee(
      field(row, "wallet_amount", "walletAmount", "wallet", "المحفظة"),
    );
    const codRaw = field(
      row,
      "cod_collected_total",
      "codCollectedTotal",
      "cod_collected",
      "codCollected",
      "المحصل",
      "المبلغ المحصل",
    );
    const subtotalProvided = clean(subtotalRaw) !== "";
    const codProvided = clean(codRaw) !== "";
    const settlementDriven = subtotalProvided || codProvided;

    const shippingRaw = field(
      row,
      "shipping_cost",
      "shippingCost",
      "shipping",
      "delivery_fee",
      "deliveryFee",
      "تكلفة الشحن",
      "أجر التوصيل",
    );
    const shippingProvided = clean(shippingRaw) !== "";
    const courierFee = parseFee(
      field(row, "courier_fee", "courierFee", "courier_earning", "أجر المندوب"),
    );

    const subtotalInput = parseAmount(subtotalRaw);
    const totalInput = parseAmount(totalRaw);
    /* A settlement row needs the goods value. When only the gross total is
     * present, invert the total formula instead of treating the gross as goods,
     * which would count shipping and discounts twice. */
    const derivedSubtotal = (() => {
      if (subtotalInput !== null) return subtotalInput;
      if (!settlementDriven || totalInput === null || !shippingProvided) {
        return totalInput;
      }
      return round2(
        totalInput + discount + rewardDiscount - parseFee(shippingRaw) + shippingDiscount - tip,
      );
    })();

    if (derivedSubtotal === null || derivedSubtotal <= 0) {
      issues.push({ line, message: "إجمالي الطلب مفقود أو غير صالح." });
      return;
    }
    const orderValue = derivedSubtotal;

    /* Shipping is its own column on settlement rows; legacy exports only carry
     * a single fee column, whose value became the delivery fee historically. */
    const deliveryFee = shippingProvided
      ? parseFee(shippingRaw)
      : parseFee(field(row, "courier_fee", "courierFee", "delivery_fee", "deliveryFee", "أجر التوصيل"));

    const paymentMethod = parsePaymentMethod(
      field(row, "payment_method", "paymentMethod", "payment", "طريقة الدفع"),
    );
    if (!paymentMethod) {
      issues.push({ line, message: "طريقة الدفع غير معروفة." });
      return;
    }

    const occurredAt = parseDate(field(row, ...DATE_HEADERS));
    if (occurredAt === null) {
      issues.push({ line, message: "تاريخ الطلب مفقود أو غير صالح." });
      return;
    }
    const deliveredAt = parseDate(field(row, ...DELIVERED_HEADERS)) ?? occurredAt;

    const expectedTotal = settlementDriven
      ? round2(orderValue - discount - rewardDiscount + deliveryFee - shippingDiscount + tip)
      : orderValue;
    const amountDue = settlementDriven ? round2(expectedTotal - walletAmount) : expectedTotal;
    const codCollected = codProvided ? parseFee(codRaw) : amountDue;
    const netDuePlatform = settlementDriven
      ? round2(codCollected - orderValue - courierFee)
      : 0;
    const courierRemittance = settlementDriven
      ? round2(codCollected - courierFee - tip)
      : 0;

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
      courierFee,
      settlementDriven,
      subtotal: orderValue,
      discount,
      rewardDiscount,
      shippingDiscount,
      tip,
      walletAmount,
      expectedTotal,
      amountDue,
      codCollected,
      netDuePlatform,
      courierRemittance,
      deliveredAt,
      note: clean(field(row, "note", "notes", "ملاحظات")),
      occurredAt,
    });
  });

  return { candidates, issues, duplicates, missingCouriers: [...missing] };
}
