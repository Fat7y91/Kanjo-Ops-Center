import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";

import {
  decideCapitalDeposit,
  findCapitalDeposit,
  insertCapitalDeposit,
  listCapitalDeposits,
  listTreasuryAccounts,
  type TreasuryAccount,
} from "./capital-repository";
import {
  capitalDepositInputSchema,
  toMinorUnits,
  type CapitalDeposit,
} from "./capital";
import { ProfileError, fromDatabaseError } from "./errors";
import { isProfileDatabaseConfigured } from "./repository";
import { signedReceiptUrl } from "./storage";

/**
 * Tier 3 rules for founder capital.
 *
 * A founder files a deposit; treasury authority decides it. Approval is the
 * only path that credits money, and the SQL trigger writes the ledger entry in
 * the same transaction, so this layer never touches the ledger directly.
 */

export type CapitalBoard = {
  deposits: CapitalDeposit[];
  /** Active treasury accounts, as approval targets. */
  accounts: TreasuryAccount[];
};

export type CapitalDecision = {
  status: "approved" | "rejected";
  accountId?: string | null;
};

function requireDatabase(): void {
  if (!isProfileDatabaseConfigured()) {
    throw new ProfileError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

/**
 * The deposits a viewer may see, plus the accounts an approval could target.
 *
 * A founder sees only their own rows; treasury authority passes no founder id
 * and sees the queue. The account list is only loaded for a viewer who may
 * decide, because a founder has nothing to do with it.
 */
export async function loadCapitalBoard(options: {
  founderId: string | null;
  canDecide: boolean;
}): Promise<CapitalBoard> {
  requireDatabase();

  const [deposits, accounts] = await Promise.all([
    listCapitalDeposits(options.founderId ?? undefined),
    options.canDecide ? listTreasuryAccounts() : Promise.resolve([]),
  ]);

  return { deposits, accounts };
}

/**
 * Files a deposit on behalf of the caller.
 *
 * The founder id always comes from the session, and the amount is converted to
 * minor units here — the same unit the ledger uses — so a rounded figure can
 * never disagree with the treasury by a piaster.
 */
export async function submitCapitalDeposit(
  founderId: string,
  rawInput: unknown,
  receiptPath: string | null,
): Promise<CapitalDeposit> {
  requireDatabase();
  const input = capitalDepositInputSchema.parse(rawInput);

  try {
    return await insertCapitalDeposit({
      founderId,
      amountMinor: toMinorUnits(input.amount),
      currency: input.currency,
      receiptPath,
      note: input.note,
    });
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      throw new ProfileError(
        "STORE_UNAVAILABLE",
        "سجل الإيداعات الرأسمالية غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

/**
 * Records a decision on a pending deposit.
 *
 * All invariants — an active reviewer, currency match, self-review ban, single
 * ledger entry — live in the SQL trigger. This function passes intent and turns
 * a trigger refusal into a domain error instead of a 500.
 */
export async function decideDeposit(
  depositId: string,
  reviewerId: string,
  decision: unknown,
): Promise<CapitalDeposit> {
  requireDatabase();

  const parsed = parseDecision(decision);
  const existing = await findCapitalDeposit(depositId);
  if (!existing) {
    throw new ProfileError("DEPOSIT_NOT_FOUND", "الإيداع غير موجود.", 404);
  }
  if (existing.status !== "pending") {
    throw new ProfileError(
      "DEPOSIT_DECIDED",
      "تم اتخاذ قرار على هذا الإيداع مسبقاً.",
      409,
    );
  }
  if (existing.founderId === reviewerId) {
    throw new ProfileError(
      "CAPITAL_DEPOSIT_SELF_REVIEW",
      "لا يمكن للمؤسس اعتماد إيداعه الرأسمالي بنفسه.",
      403,
    );
  }

  try {
    return await decideCapitalDeposit(depositId, {
      status: parsed.status,
      decidedBy: reviewerId,
      accountId: parsed.accountId ?? null,
    });
  } catch (error) {
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

function parseDecision(value: unknown): CapitalDecision {
  if (typeof value !== "object" || value === null) {
    throw new ProfileError("INVALID_DECISION", "قرار غير صالح.", 422);
  }
  const raw = value as { status?: unknown; accountId?: unknown };
  if (raw.status !== "approved" && raw.status !== "rejected") {
    throw new ProfileError("INVALID_DECISION", "قرار غير صالح.", 422);
  }
  const accountId =
    typeof raw.accountId === "string" && raw.accountId.trim() !== ""
      ? raw.accountId.trim()
      : null;

  if (raw.status === "approved" && accountId === null) {
    throw new ProfileError(
      "CAPITAL_DEPOSIT_ACCOUNT_REQUIRED",
      "اختر الحساب البنكي الذي سيُقيَّد فيه الإيداع.",
      422,
    );
  }

  return { status: raw.status, accountId };
}

/** Short-lived URL for a stored receipt, or null when there is no receipt. */
export async function receiptUrl(
  deposit: Pick<CapitalDeposit, "receiptPath">,
): Promise<string | null> {
  if (!deposit.receiptPath) return null;
  return signedReceiptUrl(deposit.receiptPath);
}
