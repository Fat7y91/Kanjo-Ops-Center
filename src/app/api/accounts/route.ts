import { NextResponse } from "next/server";

import { resolveTreasuryAccess, visibleAccounts, visibleEntries } from "@/lib/accounts/access";
import { summarizeAll, totalByCurrency } from "@/lib/accounts/ledger";
import {
  createBankAccount,
  listBankAccounts,
  listLedgerEntries,
} from "@/lib/accounts/store";
import { apiError, authorizeAny, readJson } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * The treasury screen's single read.
 *
 * It answers with everything the screen draws — rows, visible movements, totals
 * per currency and the viewer's tier — because the tier is what decides which
 * of those the UI may show. The numbers come from `app.bank_accounts` and
 * `app.ledger_entries`; a deployment without them reads empty, never seeded.
 */
export async function GET() {
  const { session, response } = await authorizeAny([
    "view_bank_balances",
    "add_bank_account",
    "view_bank_transactions",
    "record_bank_transaction",
  ]);
  if (!session) return response;

  try {
    const access = resolveTreasuryAccess(session);
    const [allAccounts, allEntries] = await Promise.all([
      listBankAccounts(),
      listLedgerEntries(),
    ]);
    const accounts = visibleAccounts(allAccounts, access);
    const entries = visibleEntries(allEntries, access);
    const summaries = summarizeAll(accounts, entries);

    return NextResponse.json(
      {
        accounts: summaries,
        entries,
        totals: totalByCurrency(summaries),
        full: access.full,
        canViewTransactions: access.canViewTransactions,
        canRecordDeposits: access.canRecordDeposits,
        canRecordExpenses: access.canRecordExpenses,
        canAddAccount: session.permissions.includes("add_bank_account"),
        canTransferFx: session.permissions.includes("post_fx_transfer"),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    "add_bank_account",
  ]);
  if (!session) return response;

  try {
    const account = await createBankAccount(
      (await readJson(request)) as Parameters<typeof createBankAccount>[0],
      session.user.id,
    );
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
