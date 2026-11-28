import { notFound } from "next/navigation";

import { CustodyReceiptPrint } from "@/components/riders/custody-receipt-print";
import { PrintButton } from "@/components/riders/print-button";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/guard";
import { loadLocations, loadRiderCustodyReceipt } from "@/lib/riders/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type PrintPageProps = {
  params: Promise<{ receiptId: string }>;
};

export default async function CustodyPrintPage({ params }: PrintPageProps) {
  await requireModuleAccess("/riders");
  const { receiptId } = await params;
  const [receipt, locations] = await Promise.all([
    loadRiderCustodyReceipt(receiptId),
    loadLocations().catch(() => ({ governorates: [], cities: [] })),
  ]);
  if (!receipt) notFound();

  const governorate = locations.governorates.find(
    (item) => item.alphaCode === receipt.rider.governorateCode,
  )?.name;
  const city = locations.cities.find(
    (item) => item.alphaCode === receipt.rider.cityCode,
  )?.name;
  const locationLabel =
    [governorate, city].filter(Boolean).join(" / ") ||
    receipt.rider.workArea ||
    "—";

  return (
    <div className="custody-print-page">
      <div className="custody-print-toolbar print:hidden">
        <Button as="a" href="/riders" variant="ghost">
          رجوع إلى العهد
        </Button>
        <PrintButton />
      </div>
      <CustodyReceiptPrint receipt={receipt} locationLabel={locationLabel} />
    </div>
  );
}
