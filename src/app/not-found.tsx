import Link from "next/link";

/**
 * Explicit 404 boundary.
 *
 * Cloudflare's `next-on-pages` adapter requires every non-static route to run on
 * the Edge Runtime. Next.js generates an implicit `/_not-found` route otherwise,
 * which the adapter rejects. Declaring it here keeps the build green.
 */
export const runtime = "edge";

export default function NotFound() {
  return (
    <main className="forbidden-shell">
      <section className="forbidden-card">
        <span className="forbidden-mark">404</span>
        <p className="eyebrow">المسار غير موجود</p>
        <h1>الصفحة التي تبحث عنها غير متاحة.</h1>
        <p className="page-description">
          قد يكون الرابط قديماً أو أن السجل المطلوب لم يعد موجوداً في مساحة
          عملك.
        </p>
        <Link className="button button-primary" href="/">
          العودة إلى مساحة العمل
        </Link>
      </section>
    </main>
  );
}
