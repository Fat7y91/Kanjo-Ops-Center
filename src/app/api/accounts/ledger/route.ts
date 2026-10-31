import { NextResponse } from "next/server";

import {
  assertCanRecord,
  resolveTreasuryAccess,
} from "@/lib/accounts/access";
import { appendLedgerEntry, findBankAccount } from "@/lib/accounts/store";
import type { LedgerEntryInput } from "@/lib/accounts/types";
import { apiError, authorizeAny, readJson } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    "manage_accounts",
    "record_deposits",
  ]);
  if (!session) return response;

  try {
    const input = (await readJson(request)) as LedgerEntryInput;
    const access = resolveTreasuryAccess(session);
    const account = findBankAccount(input.accountId);
    if (!account) {
      return NextResponse.json(
        { error: "الحساب البنكي غير موجود." },
        { status: 404 },
      );
    }

    // The tier check runs before the store sees the entry, so a deposit-only
    // caller cannot smuggle an expense or hit a Saudi account by editing the
    // request body.
    const denied = assertCanRecord(access, input.kind, account);
    if (denied) {
      return NextResponse.json({ error: denied }, { status: 403 });
    }

    const entry = appendLedgerEntry(input, session.user.id);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
