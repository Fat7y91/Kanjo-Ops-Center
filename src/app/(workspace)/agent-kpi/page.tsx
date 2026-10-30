import { KpiAgentCard } from "@/app/(workspace)/agent-kpi/components/kpi-agent-card";
import { KpiFilterBar } from "@/app/(workspace)/agent-kpi/components/kpi-filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/auth/guard";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { formatScore } from "@/lib/kpi/format";
import { loadKpiDataset } from "@/lib/kpi/repository";
import { buildKpiReport } from "@/lib/kpi/services/agent-kpi-service";
import {
  buildKpiFilterOptions,
  isKpiAdmin,
  normalizeFilters,
  parseKpiFilters,
  resolveKpiScope,
} from "@/lib/kpi/scope";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type AgentKpiPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Agent KPI dashboard (Tier 1 server container).
 *
 * Authorizes, resolves the viewer scope (reps are pinned to themselves; admins
 * may filter city/team/rep), delegates all math to the Tier 3 service and
 * renders one card per agent in scope.
 */
export default async function AgentKpiPage({ searchParams }: AgentKpiPageProps) {
  const session = await requirePermission("view_agent_kpi");
  const params = await searchParams;

  const dataset = await loadKpiDataset();
  const allowedCityIds = effectiveCityIds(session);
  const filters = normalizeFilters(parseKpiFilters(params));

  const { scope, lockedToSelf, selfAgent, cityId } = resolveKpiScope({
    viewer: {
      id: session.user.id,
      globalScope: session.globalScope,
      clearanceLevel: session.clearanceLevel,
    },
    allowedCityIds,
    filters,
    agents: dataset.agents,
  });

  const report = buildKpiReport(dataset, scope, session.user.id);
  const self = report.snapshots.find(
    (snapshot) => snapshot.agent.id === session.user.id,
  );
  const focus = self ?? report.snapshots[0];
  const options = buildKpiFilterOptions(dataset, allowedCityIds, cityId);

  const averageScore =
    Math.round(
      (report.snapshots.reduce((total, item) => total + item.score, 0) /
        report.snapshots.length) *
        10,
    ) / 10;

  return (
    <>
      <PageHeader
        eyebrow="أداء المناديب"
        title="لوحة مؤشرات المناديب"
        description="تقييم موحّد لكل مندوب وفق مرحلة دورة حياة مدينته: الاستكشاف، التعاقدات، إدخال البيانات، ثم التشغيل. المقارنة والترتيب داخل المدينة فقط."
        actions={
          <span className="badge badge-gold">
            {report.snapshots.length} مندوب · {report.cityCount} مدينة
          </span>
        }
      />

      <KpiFilterBar
        cities={options.cities}
        teams={options.teams}
        agents={options.agents}
        cityId={filters.cityId}
        team={filters.team}
        agentId={filters.agentId}
        windowDays={filters.windowDays}
        lockedToSelf={lockedToSelf}
        selfAgent={selfAgent}
        selfLabel={`${session.user.name} · ${session.user.team}`}
      />

      <section className="stat-grid">
        <StatCard
          label="نطاق العرض"
          value={String(report.snapshots.length)}
          detail={
            lockedToSelf
              ? selfAgent
                ? "مندوب واحد (حساب مندوب)"
                : "مناديب مدينتك"
              : "مناديب مطابقون للتصفية"
          }
          tone="gold"
        />
        <StatCard
          label="متوسط نقاط الفريق"
          value={formatScore(averageScore)}
          detail="متوسط درجات الأداء في النطاق المحدد"
        />
        <StatCard
          label="المتصدر"
          value={focus ? formatScore(focus.topPerformer.score) : "—"}
          detail={focus ? `${focus.topPerformer.name} · ${focus.rank.cityName}` : "لا بيانات"}
          tone="green"
        />
        <StatCard
          label="مرحلة المدينة"
          value={focus ? focus.stageLabel : "—"}
          detail="المؤشرات تتكيف مع مرحلة دورة الحياة"
        />
      </section>

      <section className="kpi-agent-grid">
        {report.snapshots.map((snapshot) => (
          <KpiAgentCard key={snapshot.agent.id} snapshot={snapshot} />
        ))}
      </section>

      {!isKpiAdmin({
          id: session.user.id,
          globalScope: session.globalScope,
          clearanceLevel: session.clearanceLevel,
        }) ? null : (
        <p className="kpi-filter-note">
          عرض إداري: يمكنك اختيار المدينة أو الفريق أو المندوب من شريط التصفية.
          الترتيب يُحتسب دائماً داخل نفس المدينة.
        </p>
      )}
    </>
  );
}
