"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { isConnectionError, isOffline } from "@/lib/errors/connection";

/**
 * Root error boundary: the last line of defence against a white screen.
 *
 * Next replaces the whole document when this renders, so it must bring its own
 * <html>/<body> and cannot rely on `globals.css` (the root layout may itself be
 * the thing that failed). Styles are therefore inline and use the brand tokens
 * as literals.
 *
 * A dropped connection is treated as recoverable: the operator sees a
 * "reconnecting" state and the page retries on `online` or a slow poll instead
 * of the fatal "Application error: a client-side exception has occurred" screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [connection, setConnection] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setConnection(isConnectionError(error));
    setOffline(isOffline());
    // Only log genuine defects; a severed stream is expected noise.
    if (!isConnectionError(error) && !isOffline()) {
      console.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (!connection && !offline) return;
    const retry = () => {
      if (navigator.onLine) reset();
    };
    window.addEventListener("online", retry);
    const timer = window.setInterval(retry, 8_000);
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [connection, offline, reset]);

  const recovering = connection || offline;

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "28px",
          background: "#f8fafc",
          color: "#1b0f26",
          fontFamily:
            '"Cairo", "Segoe UI", system-ui, -apple-system, sans-serif',
        }}
      >
        <main
          role="alert"
          aria-live="polite"
          style={{
            width: "min(560px, 100%)",
            padding: "32px",
            borderRadius: "20px",
            border: "1px solid rgba(35,5,53,0.1)",
            background: "#ffffff",
            boxShadow: "0 24px 80px -12px rgba(35,5,53,0.25)",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: "52px",
              height: "52px",
              margin: "0 auto 18px",
              borderRadius: "16px",
              display: "grid",
              placeItems: "center",
              fontSize: "1.4rem",
              background:
                "linear-gradient(135deg, #230535 0%, #6c35b6 100%)",
              color: "#ffd700",
            }}
          >
            !
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: "1.25rem",
              fontWeight: 800,
              color: "#230535",
            }}
          >
            {recovering
              ? offline
                ? "انقطع الاتصال بالشبكة"
                : "جارٍ إعادة الاتصال"
              : "تعذر تحميل التطبيق"}
          </h1>
          <p
            style={{
              margin: "0 0 22px",
              fontSize: "0.9rem",
              lineHeight: 1.7,
              color: "#64748b",
            }}
          >
            {recovering
              ? "انقطع الاتصال بالخادم أثناء تحميل الصفحة. سنعيد المحاولة تلقائياً عند عودة الاتصال، ويمكنك المحاولة الآن."
              : "حدث خطأ غير متوقع أثناء تحميل التطبيق. يمكنك إعادة المحاولة، وإذا تكرر الأمر فأبلغ فريق التشغيل."}
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => reset()}
            style={{
              border: 0,
              borderRadius: "12px",
              padding: "11px 22px",
              fontSize: "0.86rem",
              fontWeight: 700,
              color: "#ffffff",
              cursor: "pointer",
              background:
                "linear-gradient(135deg, #6c35b6 0%, #4a237d 100%)",
            }}
          >
            {recovering ? "إعادة المحاولة الآن" : "إعادة تحميل الصفحة"}
          </Button>
        </main>
      </body>
    </html>
  );
}
