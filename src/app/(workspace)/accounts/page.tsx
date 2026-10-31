import { AccountsView } from "@/components/accounts/accounts-view";
import { PageHeader } from "@/components/ui/page-header";
import {
  resolveTreasuryAccess,
  visibleAccounts,
  visibleEntries,
} from "@/lib/accounts/access";
import { summarizeAll, totalByCurrency } from "@/lib/accounts/ledger";
import {
  listBankAccounts,
  listLedgerEntries,
} from "@/lib/accounts/store";
import { requireAnyPermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function AccountsPage() {
  const session = await requireAnyPermission([
    "view_accounts",
    "manage_accounts",
    "record_deposits",
  ]);
  const access = resolveTreasuryAccess(session);
  const accounts = visibleAccounts(listBankAccounts(), access);
  const entries = visibleEntries(listLedgerEntries(), access);
  const summaries = summarizeAll(accounts, entries);
  const totals = totalByCurrency(accounts, entries);

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="الحسابات البنكية"
        description={
          access.full
            ? "أرصدة الحسابات المصرية والسعودية وحركاتها المسجّلة."
            : "إيداعات الحسابات المصرية المخصصة لمدينتك."
        }
        actions={
          <span className="badge badge-gold">{accounts.length} حساب</span>
        }
      />

      <AccountsView
        summaries={summaries}
        entries={entries}
        totals={totals}
        full={access.full}
        canRecordDeposits={access.canRecordDeposits}
        canRecordExpenses={access.canRecordExpenses}
        canAddAccount={session.permissions.includes("manage_accounts")}
      />
    </>
  );
}
