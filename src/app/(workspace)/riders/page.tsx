import { ClientErrorBoundary } from "@/components/errors/client-error-boundary";
import { RidersIsland } from "@/components/riders/riders-island";
import { requireModuleAccess } from "@/lib/auth/guard";
import { loadLocations, loadRidersBoard } from "@/lib/riders/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function RidersPage() {
  const session = await requireModuleAccess("/riders");
  const [riders, locations] = await Promise.all([
    loadRidersBoard().catch(() => []),
    loadLocations().catch(() => ({ governorates: [], cities: [] })),
  ]);

  return (
    <ClientErrorBoundary
      title="تعذر عرض مناديب التوصيل والعهد"
      description="لم تكتمل قراءة دليل المناديب. أعد المحاولة دون مغادرة الصفحة."
      connectionTitle="انقطع الاتصال أثناء تحميل العهد"
    >
      <RidersIsland
        initialRiders={riders}
        locations={locations}
        canManage={session.permissions.includes("manage_couriers")}
      />
    </ClientErrorBoundary>
  );
}
