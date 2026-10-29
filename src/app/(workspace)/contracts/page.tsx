import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const contracts = [
  {
    id: "CTR-2041",
    merchant: "سوق القاهرة الطازج",
    value: "1,240,000 ج.م",
    status: "موقّع",
    signatory: "المكتب المعتمد",
  },
  {
    id: "CTR-2042",
    merchant: "مجموعة صيدليات النيل",
    value: "860,000 ج.م",
    status: "يتطلب توقيعاً",
    signatory: "قيد الانتظار",
  },
  {
    id: "CTR-2043",
    merchant: "مطبخ الزمالك",
    value: "410,000 ج.م",
    status: "مسودة",
    signatory: "مالك المسودة",
  },
  {
    id: "CTR-2044",
    merchant: "لوازم منزل المعادي",
    value: "675,000 ج.م",
    status: "يتطلب توقيعاً",
    signatory: "قيد الانتظار",
  },
];

const statusTone: Record<string, string> = {
  "موقّع": "badge-green",
  "يتطلب توقيعاً": "badge-gold",
  مسودة: "",
};

export default async function ContractsPage() {
  await requirePermission("view_contracts");

  return (
    <>
      <PageHeader
        eyebrow="الحوكمة التجارية"
        title="سجل العقود"
        description="الصياغة والتعديل والتوقيع المعتمد صلاحيات منفصلة. لا تُستنتج صلاحية التوقيع من المسمى الوظيفي أبداً."
        actions={
          <Protect require="create_contracts">
            <button type="button" className="button button-primary">
              صياغة عقد
            </button>
          </Protect>
        }
      />

      <section className="panel">
        <div className="table-wrap w-full overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>العقد</th>
                <th>التاجر</th>
                <th>القيمة</th>
                <th>الحالة</th>
                <th>الموقّع</th>
                <th className="align-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td>
                    <strong>{contract.id}</strong>
                  </td>
                  <td>{contract.merchant}</td>
                  <td>{contract.value}</td>
                  <td>
                    <span
                      className={`badge ${statusTone[contract.status] ?? ""}`}
                    >
                      {contract.status}
                    </span>
                  </td>
                  <td className="muted">{contract.signatory}</td>
                  <td>
                    <div className="row-actions">
                      <Protect require="edit_contracts">
                        <button
                          type="button"
                          className="button button-small button-quiet"
                        >
                          تعديل
                        </button>
                      </Protect>

                      {contract.status === "يتطلب توقيعاً" && (
                        <Protect require="sign_contracts">
                          <button
                            type="button"
                            className="button button-small button-primary"
                          >
                            توقيع
                          </button>
                        </Protect>
                      )}

                      <Protect require="delete_contracts">
                        <button
                          type="button"
                          className="button button-small button-danger"
                        >
                          إلغاء
                        </button>
                      </Protect>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="panel-note">
          زر التوقيع يتطلب <code>sign_contracts</code>. محرر العقود الذي لا يملك
          هذه الصلاحية يمكنه تعديل البنود لكنه لا يستطيع التوقيع أبداً.
        </p>
      </section>
    </>
  );
}
