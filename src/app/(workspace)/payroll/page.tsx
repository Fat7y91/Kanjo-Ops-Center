import { PayrollView } from "@/components/payroll/payroll-view";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { buildPayslips } from "@/lib/payroll/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function PayrollPage() {
  await requirePermission("view_payroll");
  const payslips = buildPayslips();

  return (
    <>
      <PageHeader
        eyebrow="الرواتب والعمولات"
        title="مسير الرواتب"
        description="الراتب الأساسي وبدل الانتقال وعمولة التعاقدات المتدرجة وأجور إدخال البيانات والحوافز."
        actions={
          <span className="badge badge-gold">{payslips.length} كشف</span>
        }
      />

      <PayrollView payslips={payslips} />
    </>
  );
}
