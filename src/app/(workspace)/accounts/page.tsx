import { AccountsIsland } from "@/components/accounts/accounts-island";
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { resolveTreasuryAccess } from "@/lib/accounts/access";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Treasury shell.
 *
 * The tier is resolved here — it is an authorization fact, and the API re-derives
 * it for the payload anyway — but the balances and movements are fetched by the
 * island. A deposit-only city manager and the Head of Accounts therefore get the
 * same shell in the same time, with only the numbers differing.
 */
export default async function AccountsPage() {
  const session = await requireModuleAccess("/accounts");
  const access = resolveTreasuryAccess(session);

  const description = access.full
    ? "أرصدة الحسابات المصرية والسعودية وحركاتها المسجّلة."
    : access.canViewTransactions
      ? "حركات الحسابات البنكية المسجّلة دون أرصدة."
      : "إيداعات الحسابات المصرية المخصصة لمدينتك.";

  return (
    <ClientErrorBoundary
      title="تعذر عرض الحسابات البنكية"
      description="لم تكتمل قراءة الأرصدة والحركات. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل الحسابات البنكية"
    >
      <AccountsIsland description={description} />
    </ClientErrorBoundary>
  );
}
