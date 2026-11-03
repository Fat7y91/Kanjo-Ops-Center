import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/field-ops/format";
import { directWhatsappLink, telLink } from "@/lib/field-ops/phone";
import { listMerchantApplications } from "@/lib/merchant-applications/repository";
import { applicationStatusMeta } from "@/lib/merchant-applications/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Review queue for merchants who applied through the public landing page.
 *
 * The capability guard runs before the read, so an operator who cannot decide
 * on an application cannot load it either — the database policies use the same
 * key, so the page and the rows agree about who is allowed to be here.
 */
export default async function MerchantApplicationsPage() {
  await requirePermission("manage_merchant_applications");

  // `null` means the table is not deployed in this environment; the queue then
  // renders empty rather than failing the whole segment.
  const applications = (await listMerchantApplications()) ?? [];
  const pending = applications.filter(
    (application) => application.status === "pending",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="التجار"
        title="طلبات انضمام التجار"
        description="الطلبات الواردة من صفحة الانضمام العامة، جاهزة للتواصل واعتماد الانضمام."
        actions={
          <span className="badge badge-gold">
            {pending} طلب بانتظار المراجعة
          </span>
        }
      />

      <section className="panel">
        <div className="panel-head">
          <h2>أحدث الطلبات</h2>
          <span className="muted">{applications.length} طلب</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>المتجر</th>
                <th>المسؤول</th>
                <th>الهاتف</th>
                <th>النشاط</th>
                <th>الحالة</th>
                <th>وقت الاستلام</th>
                <th className="align-right">تواصل</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => {
                const status = applicationStatusMeta(application.status);
                const call = telLink(application.phoneNumber);
                const whatsapp = directWhatsappLink(
                  application.phoneNumber,
                  `مرحباً ${application.contactPerson}، بخصوص طلب انضمام ${application.storeName} إلى كانجو.`,
                );

                return (
                  <tr key={application.id}>
                    <td>
                      <strong>{application.storeName}</strong>
                    </td>
                    <td>{application.contactPerson}</td>
                    <td dir="ltr">
                      {call ? (
                        <a href={call}>{`+${application.phoneNumber}`}</a>
                      ) : (
                        `+${application.phoneNumber}`
                      )}
                    </td>
                    <td>{application.businessType}</td>
                    <td>
                      <span className={`badge ${status.tone}`.trim()}>
                        {status.label}
                      </span>
                    </td>
                    <td>{formatDateTime(application.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        {whatsapp ? (
                          <a
                            className="button button-small button-quiet"
                            href={whatsapp}
                            target="_blank"
                            rel="noreferrer"
                          >
                            واتساب
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {applications.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="empty-state">
                      لا توجد طلبات حتى الآن. تصل الطلبات تلقائياً من صفحة
                      الانضمام.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
