"use client";

import type {
  AutopilotSummary,
} from "@/lib/catalog/autopilot/types";

import type { AutopilotProgress } from "./use-autopilot";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="autopilot-stat">
      <span>{label}</span>
      <strong>{value.toLocaleString("ar-EG")}</strong>
    </div>
  );
}

export function AutopilotProgressPanel({
  progress,
  summary,
}: {
  progress: AutopilotProgress;
  summary: AutopilotSummary | null;
}) {
  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <div className="autopilot-progress">
      <div className="autopilot-progress-line">
        <span>
          جاري المعالجة: {progress.processed.toLocaleString("ar-EG")} /{" "}
          {progress.total.toLocaleString("ar-EG")}
        </span>
        <strong>{percent}%</strong>
      </div>
      <div
        className="autopilot-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="تقدم الاستيراد"
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="autopilot-stats">
        <Stat label="منتجات جديدة" value={progress.inserted} />
        <Stat label="تحديثات" value={progress.updated} />
        <Stat label="صور من الكتالوج" value={progress.matchedMaster} />
        <Stat label="صور من المرجع" value={progress.matchedReference} />
        <Stat label="صور من الويب" value={progress.enrichedWeb} />
        <Stat label="موجود مسبقاً" value={progress.reused} />
        <Stat label="بدون صورة" value={progress.noImage} />
        <Stat label="تحتاج مراجعة" value={progress.needsReview} />
        <Stat label="تعذر حفظها" value={progress.failed} />
      </div>

      {summary ? (
        <div>
          <p className="autopilot-note">
            اكتمل الاستيراد. تم تجاهل{" "}
            {summary.skippedParse.toLocaleString("ar-EG")} صف أثناء قراءة الملف.
          </p>
          {summary.failures.length > 0 ? (
            <ul className="autopilot-note">
              {summary.failures.slice(0, 3).map((failure) => (
                <li key={`${failure.name}-${failure.message}`}>
                  {failure.name}: {failure.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
