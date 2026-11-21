import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { CouponsIsland } from "@/components/coupons/coupons-island";
import { requireModuleAccess } from "@/lib/auth/guard";
import { loadCouponsBoard } from "@/lib/coupons/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Coupon catalogue shell.
 *
 * The server resolves access and seeds the island with the current list. The
 * island owns filtering, the create/edit dialogs and the CSV import, so the
 * catalogue never re-renders through a full navigation after a save.
 */
export default async function CouponsPage() {
  const session = await requireModuleAccess("/coupons");

  const coupons = await loadCouponsBoard().catch(() => []);

  return (
    <ClientErrorBoundary
      title="تعذر عرض الكوبونات"
      description="لم تكتمل قراءة دليل الكوبونات. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل الكوبونات"
    >
      <CouponsIsland
        initialCoupons={coupons}
        canManage={session.permissions.includes("manage_coupons")}
      />
    </ClientErrorBoundary>
  );
}
