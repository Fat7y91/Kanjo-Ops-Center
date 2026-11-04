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
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function AccountsPage() {
  const session = await requireModuleAccess("/accounts");
  const access = resolveTreasuryAccess(session);
  const accounts = visibleAccounts(listBankAccounts(), access);
  const entries = visibleEntries(listLedgerEntries(), access);
  const summaries = summarizeAll(accounts, entries);
  const totals = totalByCurrency(accounts, entries);

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="ارصدة حسابات كانجو البنكية"
        description={
          access.full
            ? "أرصدة الحسابات المصرية والسعودية وحركاتها المسجّلة."
            : access.canViewTransactions
              ? "حركات الحسابات البنكية المسجّلة دون أرصدة."
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
        canViewTransactions={access.canViewTransactions}
        canRecordDeposits={access.canRecordDeposits}
        canRecordExpenses={access.canRecordExpenses}
        canAddAccount={session.permissions.includes("add_bank_account")}
      />
    </>
  );
}
