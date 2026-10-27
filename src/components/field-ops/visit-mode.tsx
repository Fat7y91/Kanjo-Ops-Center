"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { captureLocation, formatCoordinates, formatDuration } from "@/lib/field-ops/geolocation";
import {
  CONTRACT_STATE_META,
  teamLabel,
  type GeoCapture,
  type Merchant,
} from "@/lib/field-ops/types";

export type VisitDraft = {
  clientVisitId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  startLocation: GeoCapture | null;
  endLocation: GeoCapture | null;
  taskId: string | null;
  geoError: string | null;
};

type VisitModeProps = {
  merchant: Merchant;
  taskId: string | null;
  onComplete: (draft: VisitDraft) => void;
  onCancel: () => void;
};

const GEO_ERROR_LABEL: Record<string, string> = {
  denied: "تم رفض إذن الموقع. يمكنك متابعة الزيارة وسيُسجَّل غياب الإحداثيات.",
  unavailable: "تعذر تحديد الموقع حالياً (إشارة ضعيفة). يمكنك المتابعة.",
  timeout: "انتهت مهلة تحديد الموقع. يمكنك المتابعة وسيُسجَّل بدون إحداثيات.",
  unsupported: "الجهاز لا يدعم تحديد الموقع. يمكنك المتابعة.",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Locked "Visit Mode" focus screen.
 *
 * While active it portals a full-viewport surface above the app shell, hides
 * the sidebar/navigation, and traps the rep on one screen: merchant context,
 * manager notes, commission target, live timer and the End Visit action.
 */
export function VisitMode({ merchant, taskId, onComplete, onCancel }: VisitModeProps) {
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString());
  const [elapsed, setElapsed] = useState(0);
  const [startLocation, setStartLocation] = useState<GeoCapture | null>(null);
  const [locating, setLocating] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [endLocation, setEndLocation] = useState<GeoCapture | null>(null);
  const clientVisitIdRef = useRef<string>("");

  if (!clientVisitIdRef.current) {
    clientVisitIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `visit-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }

  useEffect(() => {
    document.body.classList.add("visit-mode-active");
    return () => {
      document.body.classList.remove("visit-mode-active");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void captureLocation().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setStartLocation(result.capture);
        setGeoError(null);
      } else {
        setGeoError(GEO_ERROR_LABEL[result.reason] ?? "تعذر التقاط الموقع.");
      }
      setLocating(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function handleEnd() {
    if (ending) return;
    setEnding(true);

    // End GPS is best-effort but time-boxed: a rep standing in a basement must
    // still be able to close the visit.
    const endResult = await captureLocation({ timeout: 8_000 });
    const endedAt = new Date().toISOString();
    const finalEnd = endResult.ok ? endResult.capture : null;
    setEndLocation(finalEnd);

    const durationSeconds = Math.max(
      0,
      Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
    );

    onComplete({
      clientVisitId: clientVisitIdRef.current,
      startedAt,
      endedAt,
      durationSeconds,
      startLocation,
      endLocation: finalEnd,
      taskId,
      geoError: endResult.ok ? geoError : GEO_ERROR_LABEL[endResult.reason] ?? geoError,
    });
  }

  const meta = CONTRACT_STATE_META[merchant.contractState];
  const urgent = elapsed >= 45 * 60;

  const content = (
    <div className="visit-mode" role="dialog" aria-modal="true" aria-label="وضع الزيارة">
      <header className="visit-mode-head">
        <div className="visit-mode-brand">
          <span className="brand-mark">K</span>
          <div>
            <p className="eyebrow">وضع الزيارة الميدانية</p>
            <strong>التركيز الكامل على التاجر</strong>
          </div>
        </div>
        <span className={`visit-mode-clock${urgent ? " is-urgent" : ""}`}>
          <span className="visit-live-dot" />
          <span className="visit-clock-value">{formatDuration(elapsed)}</span>
          <span className="visit-clock-label">مدة الزيارة الجارية</span>
        </span>
      </header>

      <div className="visit-mode-body">
        <section className="visit-mode-card visit-merchant-card">
          <p className="eyebrow">{teamLabel(merchant.team)}</p>
          <h1>{merchant.name}</h1>
          <div className="visit-badges">
            <span className={`badge ${meta.tone}`}>{meta.label}</span>
            <span className="badge">{merchant.vendorType}</span>
            <span className="badge">
              هدف العمولة {merchant.targetCommission}%
            </span>
          </div>

          <div className="visit-figures">
            <div>
              <span>القيمة الشهرية</span>
              <strong>
                {new Intl.NumberFormat("ar-EG", {
                  style: "currency",
                  currency: "EGP",
                  maximumFractionDigits: 0,
                }).format(merchant.monthlyValue)}
              </strong>
            </div>
            <div>
              <span>العمولة المستهدفة</span>
              <strong>{merchant.targetCommission}%</strong>
            </div>
            <div>
              <span>العمولة المكتسبة</span>
              <strong>
                {new Intl.NumberFormat("ar-EG", {
                  style: "currency",
                  currency: "EGP",
                  maximumFractionDigits: 0,
                }).format(merchant.commissionAmount)}
              </strong>
            </div>
          </div>
        </section>

        <section className="visit-mode-card visit-notes-card">
          <div className="visit-card-head">
            <p className="eyebrow">ملاحظات المدير الاستراتيجية</p>
            <span className="badge badge-purple">اقرأها قبل الحوار</span>
          </div>
          <p className="visit-strategic-notes">
            {merchant.strategicNotes || "لا توجد ملاحظات استراتيجية مسجلة لهذا التاجر."}
          </p>
        </section>

        <section className="visit-mode-card visit-tracking-card">
          <div className="visit-card-head">
            <p className="eyebrow">تتبع الزيارة</p>
            <span
              className={`badge ${
                locating ? "badge-gold" : startLocation ? "badge-green" : "badge-red"
              }`}
            >
              {locating
                ? "جارٍ التقاط الموقع…"
                : startLocation
                  ? "تم تثبيت موقع البداية"
                  : "بدون إحداثيات"}
            </span>
          </div>
          <div className="visit-tracking-grid">
            <div>
              <span>بداية الزيارة</span>
              <strong>{formatDateTime(startedAt)}</strong>
            </div>
            <div>
              <span>موقع البداية</span>
              <strong className="visit-coords">{formatCoordinates(startLocation)}</strong>
              {startLocation?.accuracy != null ? (
                <small>دقة ±{startLocation.accuracy} م</small>
              ) : null}
            </div>
            {endLocation ? (
              <div>
                <span>موقع النهاية</span>
                <strong className="visit-coords">{formatCoordinates(endLocation)}</strong>
              </div>
            ) : null}
          </div>
          {geoError ? <p className="visit-geo-note">{geoError}</p> : null}
        </section>
      </div>

      <footer className="visit-mode-foot">
        <div className="visit-foot-note">
          <strong>أنت الآن داخل وضع الزيارة.</strong>
          <span>
            التنقل والقائمة معطّلان حتى تُنهي الزيارة وتُدخل التقرير.
          </span>
        </div>
        <div className="visit-foot-actions">
          <button
            type="button"
            className="button button-quiet visit-cancel"
            onClick={() => {
              if (window.confirm("هل تريد إلغاء الزيارة دون حفظها؟")) {
                onCancel();
              }
            }}
            disabled={ending}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="button button-primary visit-end"
            onClick={() => void handleEnd()}
            disabled={ending}
          >
            {ending ? "جارٍ إنهاء الزيارة…" : "إنهاء الزيارة"}
          </button>
        </div>
      </footer>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
