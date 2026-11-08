import {
  DESOUK_MERCHANT_IDS,
  FINANCIAL_EXCEPTION_MERCHANT,
} from "./constants";
import type { ContractDocumentInput } from "./input";

export type LegalContext = {
  financialSpecialException: string;
  jurisdictionClause: string;
};

/**
 * Hardcoded per-merchant legal exceptions from V1.
 *
 * `سفير السعادة` gets a monthly/semi-monthly settlement rider; the butcher
 * `الحيطاوى` (matched by immutable merchant id, not name) is under Desouk
 * court jurisdiction.
 */
export function resolveLegalContext(input: ContractDocumentInput): LegalContext {
  const merchantKey = String(input.merchantName ?? "").replace(/\s+/g, " ").trim();
  const financialSpecialException = merchantKey.includes(FINANCIAL_EXCEPTION_MERCHANT)
    ? " استثناء خاص: يتم تصفية الحسابات وإجراء التسويات المالية كل شهر أو شهرين بناءً على طلب الطرف الثاني."
    : "";

  const isDesouk = (DESOUK_MERCHANT_IDS as readonly string[]).includes(
    String(input.merchantId ?? "").trim(),
  );
  const jurisdictionClause = isDesouk
    ? "ثم تختص محكمة دسوق."
    : "ثم تختص المحكمة المختصة في نطاق مقر كانجو ما لم يتفق على خلاف ذلك.";

  return { financialSpecialException, jurisdictionClause };
}
