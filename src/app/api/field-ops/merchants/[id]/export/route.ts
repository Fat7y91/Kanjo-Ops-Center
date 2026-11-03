import { NextResponse } from "next/server";

import { actorFromSession, apiError, authorize } from "@/lib/auth/api";
import { loadMerchantStates } from "@/lib/field-ops/state-source";
import { getMerchantById } from "@/lib/field-ops/store";
import { getMerchantV1Profile } from "@/lib/field-ops/merchant-profile-repository";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Excel export of one merchant.
 *
 * Emits SpreadsheetML 2003, which Excel and LibreOffice open natively, so the
 * project carries no spreadsheet dependency. The filename and content type are
 * what make it an `.xls` download rather than a page.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
  return `<Row><Cell><Data ss:Type="String">${escapeXml(label)}</Data></Cell><Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell></Row>`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("export_merchant_data");
  if (!session) return response;
  const { id } = await context.params;

  const merchant = getMerchantById(id);
  if (!merchant) {
    return NextResponse.json(
      { error: "التاجر غير موجود.", code: "MERCHANT_NOT_FOUND" },
      { status: 404 },
    );
  }

  let profile;
  try {
    profile = await getMerchantV1Profile(id);
  } catch (error) {
    return apiError(error);
  }
  // The export is an official document: it must print the resolved agreement
  // state, not the last value some writer happened to store.
  const states = await loadMerchantStates([merchant]);
  const contractState = states.get(merchant.id)?.state ?? merchant.contractState;
  const meta = CONTRACT_STATE_META[contractState];
  const actor = actorFromSession(session);

  const rows = [
    row("اسم التاجر", merchant.name),
    row("المدينة", merchant.cityId),
    row("الفريق", merchant.team ?? "غير مسند"),
    row("نوع النشاط", merchant.vendorType),
    row("حالة العقد", meta.labelAr),
    row("القيمة الشهرية", String(merchant.monthlyValue)),
    row("العمولة المستهدفة", `${merchant.targetCommission}%`),
    row(
      "النسبة المتفق عليها",
      merchant.agreedCommission != null
        ? `${merchant.agreedCommission}%`
        : "غير محددة",
    ),
    row("العنوان الفعلي", profile.actualAddress),
    row("فيسبوك", profile.facebookUrl),
    row("إنستغرام / الموقع", profile.instagramUrl),
    row("منشور في التطبيق", profile.appPublished ? "نعم" : "لا"),
    row("قائمة VIP", profile.vipMenu ? "نعم" : "لا"),
    row("مجلد الملفات الرسمية", profile.driveFolderUrl),
    row("صُدّر بواسطة", actor.name),
    row("تاريخ التصدير", new Date().toISOString().slice(0, 19)),
  ].join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Merchant">
    <Table>${rows}</Table>
  </Worksheet>
</Workbook>`;

  const filename = `kanjo-${merchant.id}.xls`;
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
