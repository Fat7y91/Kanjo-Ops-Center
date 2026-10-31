import { NextResponse } from "next/server";

import { resolveTreasuryAccess, visibleAccounts, visibleEntries } from "@/lib/accounts/access";
import { summarizeAll } from "@/lib/accounts/ledger";
import {
  createBankAccount,
  listBankAccounts,
  listLedgerEntries,
} from "@/lib/accounts/store";
import { apiError, authorizeAny, readJson } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const { session, response } = await authorizeAny([
    "view_accounts",
    "manage_accounts",
    "record_deposits",
  ]);
  if (!session) return response;

  const access = resolveTreasuryAccess(session);
  const accounts = visibleAccounts(listBankAccounts(), access);
  const entries = visibleEntries(listLedgerEntries(), access);

  return NextResponse.json(
    {
      accounts: summarizeAll(accounts, entries),
      entries,
      full: access.full,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    "manage_accounts",
  ]);
  if (!session) return response;

  try {
    const account = createBankAccount(
      (await readJson(request)) as Parameters<typeof createBankAccount>[0],
    );
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
