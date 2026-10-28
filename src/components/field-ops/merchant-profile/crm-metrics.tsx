"use client";

import { formatDuration } from "@/lib/field-ops/geolocation";
import type {
  MerchantCrmSummary,
} from "@/lib/field-ops/store";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";
import type { FollowUpTask } from "@/lib/field-ops/types";

import { formatDateTime } from "@/lib/field-ops/format";

type CrmMetricsProps = {
  summary: MerchantCrmSummary;
  followUps: FollowUpTask[];
};

export function CrmMetrics({ summary, followUps }: CrmMetricsProps) {
  return (
    <section className="crm-metrics" aria-label="تحليلات التاجر المجمّعة">
      <article className="panel crm-metric">
        <span>إجمالي الزيارات</span>
        <strong>{summary.visitCount}</strong>
        <small>{summary.reps.length} مندوب مختلف</small>
      </article>
      <article className="panel crm-metric">
        <span>متوسط مدة الزيارة</span>
        <strong>{formatDuration(summary.averageDurationSeconds)}</strong>
        <small>
          إجمالي {formatDuration(summary.totalDurationSeconds)} وقت ميداني
        </small>
      </article>
      <article className="panel crm-metric">
        <span>آخر زيارة</span>
        <strong className="crm-metric-date">
          {summary.lastVisitAt ? formatDateTime(summary.lastVisitAt) : "لا يوجد"}
        </strong>
        <small>
          {summary.lastOutcome
            ? `النتيجة: ${CONTRACT_STATE_META[summary.lastOutcome].label}`
            : "بدون تقارير"}
        </small>
      </article>
      <article className="panel crm-metric">
        <span>المتابعة القادمة</span>
        <strong className="crm-metric-date">
          {summary.nextFollowUpAt
            ? formatDateTime(summary.nextFollowUpAt)
            : "لا توجد"}
        </strong>
        <small>
          {followUps.filter((task) => task.status === "scheduled").length} مهمة
          مفتوحة
        </small>
      </article>
    </section>
  );
}
