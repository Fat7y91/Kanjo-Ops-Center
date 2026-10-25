import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const products = [
  {
    name: "زيت زيتون عضوي 1 لتر",
    merchant: "سوق القاهرة الطازج",
    price: "480 ج.م",
    state: "منشور",
    review: "سليم",
  },
  {
    name: "باراسيتامول 500 ملجم",
    merchant: "مجموعة صيدليات النيل",
    price: "35 ج.م",
    state: "منشور",
    review: "سليم",
  },
  {
    name: "صندوق وجبة عائلية",
    merchant: "مطبخ الزمالك",
    price: "620 ج.م",
    state: "مسودة",
    review: "الصورة معلّقة",
  },
  {
    name: "طقم مناشف قطنية",
    merchant: "لوازم منزل المعادي",
    price: "290 ج.م",
    state: "منشور",
    review: "مراجعة السعر",
  },
];

export default async function CatalogPage() {
  await requirePermission("view_catalog");

  return (
    <>
      <PageHeader
        eyebrow="حوكمة الكتالوج"
        title="كتالوج المنتجات"
        description="الأسعار وحالة النشر ومراجعة الجودة لمنتجات التجار. أدوات الإنشاء والحذف محكومة بالصلاحيات."
        actions={
          <Protect require="create_products">
            <button type="button" className="button button-primary">
              إضافة منتج
            </button>
          </Protect>
        }
      />

      <section className="toolbar-row">
        <span className="badge">4 منتجات</span>
        <span className="badge badge-gold">مسودة واحدة</span>
        <span className="badge badge-red">عنصر يحتاج مراجعة</span>
      </section>

      <section className="card-grid">
        {products.map((product) => (
          <article key={product.name} className="product-card">
            <div className="product-thumb" aria-hidden="true">
              <span>{product.name.slice(0, 2)}</span>
            </div>
            <div className="product-body">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">{product.merchant}</p>
                  <h2>{product.name}</h2>
                </div>
                <span
                  className={`badge ${
                    product.state === "منشور" ? "badge-green" : "badge-gold"
                  }`}
                >
                  {product.state}
                </span>
              </div>
              <div className="product-meta">
                <strong>{product.price}</strong>
                <span>{product.review}</span>
              </div>
              <div className="row-actions">
                <Protect require="edit_products">
                  <button
                    type="button"
                    className="button button-small button-quiet"
                  >
                    تعديل
                  </button>
                </Protect>
                <Protect require="delete_products">
                  <button
                    type="button"
                    className="button button-small button-danger"
                  >
                    حذف
                  </button>
                </Protect>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ملاحظة حوكمة</p>
            <h2>ضوابط مدفوعة بالصلاحيات</h2>
          </div>
        </div>
        <p className="panel-note">
          مشغّل الكتالوج الذي لا يملك <code>delete_products</code> لا يتلقى زر
          حذف أبداً، بينما يحتفظ المراجع المقتصر على التعديل بحق التعديل. يكرر
          الخادم الفحص نفسه لكل طلب تغيير.
        </p>
      </section>
    </>
  );
}
