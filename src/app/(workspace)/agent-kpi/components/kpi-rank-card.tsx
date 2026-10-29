import { formatRank, formatScore } from "@/lib/kpi/format";
import type { KpiSnapshot } from "@/lib/kpi/types";

/**
 * City-scoped competitive ranking (Tier 1, dumb).
 *
 * `rank.total` is always the number of reps in the same city — the service
 * never mixes cities or teams, so the copy can safely say "داخل مدينتك".
 */
export function KpiRankCard({ snapshot }: { snapshot: KpiSnapshot }) {
  const { rank, topPerformer, score } = snapshot;
  const progress =
    rank.total === 0
      ? 0
      : Math.round(((rank.total - rank.position + 1) / rank.total) * 100);

  return (
    <article className="kpi-rank-card">
      <span className="kpi-rank-label">الترتيب التنافسي داخل المدينة</span>

      <div className="kpi-rank-value">
        <strong>{rank.position}</strong>
        <span>من {rank.total} مناديب في {rank.cityName}</span>
      </div>

      <div
        className="kpi-rank-bar"
        role="img"
        aria-label={`${formatRank(rank.position, rank.total)} داخل ${rank.cityName}`}
      >
        <span style={{ width: `${Math.max(6, progress)}%` }} />
      </div>

      <div className="kpi-rank-foot">
        <span>
          نقاط الأداء: <strong>{formatScore(score)}</strong>
        </span>
        <span>{formatRank(rank.position, rank.total)}</span>
      </div>

      <div className="kpi-top-performer">
        <span>
          {topPerformer.isSelf ? "أنت متصدر المدينة" : "المتصدر في مدينتك"}
        </span>
        <strong>
          {topPerformer.isSelf ? snapshot.agent.name : topPerformer.name} ·{" "}
          {formatScore(topPerformer.score)}
        </strong>
      </div>
    </article>
  );
}
