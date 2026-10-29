import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "كانجو | الصفحة غير موجودة",
};

export default function GlobalNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <main className="forbidden-shell">
          <section className="forbidden-card">
            <span className="forbidden-mark">404</span>
            <p className="eyebrow">المسار غير موجود</p>
            <h1>الصفحة التي تبحث عنها غير متاحة.</h1>
            <p className="page-description">
              قد يكون الرابط قديماً أو أن السجل المطلوب لم يعد موجوداً في مساحة
              عملك.
            </p>
            <a className="button button-primary" href="/">
              العودة إلى مساحة العمل
            </a>
          </section>
        </main>
      </body>
    </html>
  );
}
