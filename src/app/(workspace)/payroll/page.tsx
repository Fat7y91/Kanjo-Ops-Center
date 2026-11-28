import { PayrollView } from "@/components/payroll/payroll-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { buildPayslips } from "@/lib/payroll/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function PayrollPage() {
  const session = await requireModuleAccess("/payroll");
  const canViewAll = session.permissions.includes("view_payroll_sheets");
  const payslips = await buildPayslips({
    userId: session.user.id,
    canViewAll,
  });

  return (
    <>
      <PageHeader
        eyebrow="الرواتب والعمولات"
        title={canViewAll ? "مسير الرواتب" : "كشف راتبي"}
        description={
          canViewAll
            ? "الراتب الأساسي وبدل الانتقال وعمولة التعاقدات المتدرجة وأجور إدخال البيانات والحوافز."
            : "كشف راتبك الأساسي وعمولاتك وحوافزك."
        }
        actions={
          <span className="badge badge-gold">{payslips.length} كشف</span>
        }
      />

      <PayrollView payslips={payslips} />
    </>
  );
}
