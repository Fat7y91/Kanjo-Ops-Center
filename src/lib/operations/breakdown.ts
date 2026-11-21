import type { OperationLog } from "./types";

/**
 * Unit economics for one fulfilled order.
 *
 * The figures come from the money terms frozen on the operation row at insert
 * time, and the journal lines are carried alongside as the audit trail. The
 * breakdown is a *reading* of that single source: it never recomputes a
 * commission or a split, so it can never disagree with the posted entry.
 *
 * The waterfall balances by construction:
 *
 *   customer pays = merchant dues + courier dues + cashback + platform net
 *
 * which is the cash-conservation identity of the order. A coupon reduces what
 * someone pays and shifts who bears it: the platform-funded share is a platform
 * expense, the vendor-funded share reduces the merchant's dues, and cashback is
 * credited to the customer's wallet rather than deducted from cash.
 */

/** One row of the management invoice, in posting order. */
export type BreakdownLine = {
  key:
    | "customer_pays"
    | "merchant_dues"
    | "courier_dues"
    | "cashback"
    | "platform_net";
  label: string;
  amount: number;
  /** `base` opens the waterfall, `deduction` subtracts, `total` closes it. */
  tone: "base" | "deduction" | "total";
};

export type CouponBreakdown = {
  code: string;
  discount: number;
  shipping: number;
  cashback: number;
  platformFunded: number;
  vendorFunded: number;
};

/** One posted journal line, as the audit view renders it. */
export type BreakdownJournalLine = {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  memo: string;
};

export type OrderBreakdown = {
  operation: {
    id: string;
    orderId: string;
    merchantName: string;
    courierName: string;
    paymentMethod: OperationLog["paymentMethod"];
    currency: OperationLog["currency"];
    occurredAt: string;
    note: string;
  };
  /** What the customer hands over (cash on delivery, or a settled online total). */
  customerPays: number;
  orderValue: number;
  deliveryFee: number;
  walletDiscount: number;
  merchantDues: number;
  commission: number;
  courierDues: number;
  courierProfit: number;
  platform: {
    commissionRevenue: number;
    deliveryRevenue: number;
    couponExpense: number;
    walletExpense: number;
    courierExpense: number;
    cashbackExpense: number;
    /** Gross margin before cashback, then the net the platform keeps. */
    gross: number;
    net: number;
  };
  coupon: CouponBreakdown | null;
  waterfall: BreakdownLine[];
  journal: {
    entryId: string | null;
    lines: BreakdownJournalLine[];
    debitTotal: number;
    creditTotal: number;
    balanced: boolean;
  };
};

/** A posted journal line joined to its account, in minor units. */
export type JournalLineInput = {
  id: string;
  code: string;
  name: string;
  debitMinor: number;
  creditMinor: number;
  memo: string;
};

const money = (minor: number) => Math.round(minor) / 100;

/**
 * Party control-account bases. A party sub-account is keyed `base:party`, so the
 * base code identifies the role while the suffix is the raw id. The audit view
 * shows the resolved participant instead of the id.
 */
const MERCHANT_ACCOUNT_BASES = new Set(["1100", "2000"]);
const COURIER_ACCOUNT_BASES = new Set(["1200", "2100"]);

function partyAccountLabel(
  code: string,
  fallback: string,
  merchantName: string,
  courierName: string,
): string {
  const base = code.split(":")[0];
  if (MERCHANT_ACCOUNT_BASES.has(base)) return merchantName || fallback;
  if (COURIER_ACCOUNT_BASES.has(base)) return courierName || fallback;
  return fallback;
}

/**
 * Builds the breakdown from a stored operation and its journal lines.
 *
 * Every displayed figure is a frozen column; the journal is attached for audit
 * and to prove the entry balances. Lines are grouped by control-account code so
 * a party sub-account is attributed to its role rather than its raw id.
 */
export function buildOrderBreakdown(
  operation: OperationLog,
  entryId: string | null,
  lines: readonly JournalLineInput[],
): OrderBreakdown {
  const orderValue = operation.orderValue;
  const deliveryFee = operation.deliveryFee;
  const couponDiscount = operation.couponDiscount;
  const couponShipping = operation.couponShippingDiscount;
  const couponCashback = operation.couponCashback;
  const couponPlatform = operation.couponPlatformFunded;
  const couponVendor = operation.couponVendorFunded;
  const walletDiscount = operation.walletDiscount;
  const commission = operation.commission;
  const courierProfit = operation.courierCut;

  // Coupon discount already includes any shipping discount, per the freeze
  // trigger; take it as the single deducted figure to avoid double counting.
  const customerPays = orderValue + deliveryFee - couponDiscount - walletDiscount;
  const merchantDues = orderValue - couponVendor - commission;

  const commissionRevenue = commission;
  const deliveryRevenue = deliveryFee;
  const couponExpense = couponPlatform;
  const walletExpense = walletDiscount;
  const courierExpense = courierProfit;
  const cashbackExpense = couponCashback;

  const gross =
    commissionRevenue +
    deliveryRevenue -
    couponExpense -
    walletExpense -
    courierExpense;
  const net = gross - cashbackExpense;

  /* Courier dues are the courier's profit on this order (`K`). The `2100`
   * control balance is a different figure — it is the settlement payable and
   * also carries the coupon/wallet/shipping adjustments — so using it here
   * would break the customer-pays identity. The journal itself is attached
   * below as the audit trail. */
  const courierDues = courierProfit;

  const coupon: CouponBreakdown | null = operation.couponCode
    ? {
        code: operation.couponCode,
        discount: couponDiscount,
        shipping: couponShipping,
        cashback: couponCashback,
        platformFunded: couponPlatform,
        vendorFunded: couponVendor,
      }
    : null;

  const waterfall: BreakdownLine[] = [
    {
      key: "customer_pays",
      label: "يدفع العميل",
      amount: customerPays,
      tone: "base",
    },
    {
      key: "merchant_dues",
      label: "مستحقات التاجر",
      amount: merchantDues,
      tone: "deduction",
    },
    {
      key: "courier_dues",
      label: "مستحقات مندوب التوصيل",
      amount: courierDues,
      tone: "deduction",
    },
    {
      key: "cashback",
      label: "كاش باك للعميل",
      amount: cashbackExpense,
      tone: "deduction",
    },
    {
      key: "platform_net",
      label: "صافي ربح المنصة",
      amount: net,
      tone: "total",
    },
  ];

  const debitTotal = money(
    lines.reduce((sum, line) => sum + line.debitMinor, 0),
  );
  const creditTotal = money(
    lines.reduce((sum, line) => sum + line.creditMinor, 0),
  );

  return {
    operation: {
      id: operation.id,
      orderId: operation.orderId,
      merchantName: operation.merchantName,
      courierName: operation.courierName,
      paymentMethod: operation.paymentMethod,
      currency: operation.currency,
      occurredAt: operation.occurredAt,
      note: operation.note,
    },
    customerPays,
    orderValue,
    deliveryFee,
    walletDiscount,
    merchantDues,
    commission,
    courierDues,
    courierProfit,
    platform: {
      commissionRevenue,
      deliveryRevenue,
      couponExpense,
      walletExpense,
      courierExpense,
      cashbackExpense,
      gross,
      net,
    },
    coupon,
    waterfall,
    journal: {
      entryId,
      lines: lines.map((line) => {
        const baseCode = line.code.split(":")[0];
        return {
          id: line.id,
          code: baseCode,
          name: partyAccountLabel(
            line.code,
            line.name,
            operation.merchantName,
            operation.courierName,
          ),
          debit: money(line.debitMinor),
          credit: money(line.creditMinor),
          memo: line.memo,
        };
      }),
      debitTotal,
      creditTotal,
      balanced: lines.length > 0 && debitTotal === creditTotal,
    },
  };
}
