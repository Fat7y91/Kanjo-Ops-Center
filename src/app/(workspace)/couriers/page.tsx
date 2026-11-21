import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { CouriersIsland } from "@/components/couriers/couriers-island";
import { requireModuleAccess } from "@/lib/auth/guard";
import { loadCouriersBoard } from "@/lib/couriers/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Delivery roster shell.
 *
 * The server resolves access and seeds the island with the current list. The
 * island owns filtering, the add/edit dialogs and the client-side refresh that
 * follows a save, so the roster never re-renders through a full navigation.
 */
export default async function CouriersPage() {
  const session = await requireModuleAccess("/couriers");

  const couriers = await loadCouriersBoard().catch(() => []);

  return (
    <ClientErrorBoundary
      title="تعذر عرض مناديب التوصيل"
      description="لم تكتمل قراءة دليل شركاء التوصيل. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل مناديب التوصيل"
    >
      <CouriersIsland
        initialCouriers={couriers}
        canManage={session.permissions.includes("manage_couriers")}
      />
    </ClientErrorBoundary>
  );
}
