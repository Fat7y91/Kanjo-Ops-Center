"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CityMap } from "@/components/field-ops/city-map";
import { Modal } from "@/components/field-ops/modal";
import {
  CITY_STAGES,
  CITY_STAGE_META,
  type City,
  type CityStage,
  type Competitor,
  type MarketStrength,
  type ZonePoint,
} from "@/lib/field-ops/types";

type CitiesClientProps = {
  initialCities: City[];
  canManage: boolean;
  viewerName: string;
};

type FormState = {
  name: string;
  country: string;
  population: string;
  stage: CityStage;
  strategicNotes: string;
  competitors: Array<{
    name: string;
    page: string;
    marketStrength: MarketStrength;
  }>;
};

const EMPTY_FORM: FormState = {
  name: "",
  country: "مصر",
  population: "",
  stage: "contracting",
  strategicNotes: "",
  competitors: [],
};

const STRENGTH_LABEL: Record<MarketStrength, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function CitiesClient({
  initialCities,
  canManage,
  viewerName,
}: CitiesClientProps) {
  const router = useRouter();
  const [cities, setCities] = useState(initialCities);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [zone, setZone] = useState<ZonePoint[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const population = cities.reduce((sum, city) => sum + city.population, 0);
    const competitors = new Set(
      cities.flatMap((city) => city.competitors.map((item) => item.name)),
    );
    const live = cities.filter(
      (city) => city.stage === "live_operations",
    ).length;
    return { population, competitors: competitors.size, live };
  }, [cities]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(EMPTY_FORM);
    setZone([]);
    setError("");
    setEditingId(null);
  }

  function openCreate() {
    reset();
    setOpen(true);
  }

  function openEdit(city: City) {
    setEditingId(city.id);
    setForm({
      name: city.name,
      country: city.country,
      population: String(city.population),
      stage: city.stage,
      strategicNotes: city.strategicNotes,
      competitors: city.competitors.map((competitor) => ({
        name: competitor.name,
        page: competitor.page,
        marketStrength: competitor.marketStrength,
      })),
    });
    setZone(city.zone.map((point) => ({ ...point })));
    setError("");
    setOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (zone.length < 3) {
      setError("ارسم ثلاث نقاط حدود على الأقل على الخريطة.");
      return;
    }
    setSaving(true);
    try {
      const endpoint = editingId
        ? `/api/field-ops/cities/${editingId}`
        : "/api/field-ops/cities";
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          population: Number(form.population),
          zone,
        }),
      });
      const payload = (await response.json()) as {
        city?: City;
        error?: string;
      };
      if (!response.ok || !payload.city) {
        throw new Error(payload.error ?? "تعذر حفظ المدينة.");
      }
      const saved = payload.city;
      setCities((current) => {
        const next = editingId
          ? current.map((city) => (city.id === saved.id ? saved : city))
          : [...current, saved];
        return next.sort((left, right) =>
          left.name.localeCompare(right.name, "ar"),
        );
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ المدينة.",
      );
    } finally {
      setSaving(false);
    }
  }

  function addCompetitor() {
    setForm((current) => ({
      ...current,
      competitors: [
        ...current.competitors,
        { name: "", page: "", marketStrength: "medium" },
      ],
    }));
  }

  function updateCompetitor(
    index: number,
    patch: Partial<FormState["competitors"][number]>,
  ) {
    setForm((current) => ({
      ...current,
      competitors: current.competitors.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  return (
    <>
      <section className="stat-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card">
          <p className="eyebrow">المدن النشطة</p>
          <strong className="stat-value">{formatNumber(cities.length)}</strong>
          <span className="stat-hint">
            {formatNumber(totals.live)} مدينة في مرحلة التشغيل
          </span>
        </div>
        <div className="stat-card">
          <p className="eyebrow">عدد السكان المغطى</p>
          <strong className="stat-value">
            {(totals.population / 1_000_000).toFixed(1)}M
          </strong>
          <span className="stat-hint">عبر جميع المدن ذات النطاقات</span>
        </div>
        <div className="stat-card">
          <p className="eyebrow">قائمة المنافسين</p>
          <strong className="stat-value">
            {formatNumber(totals.competitors)}
          </strong>
          <span className="stat-hint">لاعبون مختلفون في السوق</span>
        </div>
        <div className="stat-card">
          <p className="eyebrow">المساحة المرسومة</p>
          <strong className="stat-value">
            {formatNumber(
              cities.reduce((sum, city) => sum + city.zone.length, 0),
            )}
          </strong>
          <span className="stat-hint">نقطة حدود جغرافية محفوظة</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">الجغرافيا التشغيلية</p>
            <h2>نطاقات المدن ومعلومات السوق</h2>
          </div>
          {canManage ? (
            <button
              type="button"
              className="button button-primary"
              onClick={openCreate}
            >
              إضافة مدينة
            </button>
          ) : null}
        </div>
        <CityMap
          cities={cities.map((city) => ({
            id: city.id,
            name: city.name,
            stage: city.stage,
            zone: city.zone,
          }))}
          height={360}
          center={[30.05, 31.15]}
          zoom={9}
        />
        <p className="panel-note">
          تُحفظ الحدود كنقاط جغرافية مغلقة قابلة للتخزين في Firestore. اختر
          مدينة أدناه لمراجعة مرحلتها التشغيلية وعدد السكان والمنافسين.
        </p>
      </section>

      <section className="city-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cities.map((city) => {
          const meta = CITY_STAGE_META[city.stage];
          return (
            <article key={city.id} className="panel city-card">
              <div className="city-card-head">
                <div>
                  <p className="eyebrow">{city.country}</p>
                  <h2>{city.name}</h2>
                </div>
                <span className={`badge ${meta.tone}`}>{meta.label}</span>
              </div>
              <div className="detail-grid">
                <div>
                  <span className="detail-label">عدد السكان</span>
                  <strong>{formatNumber(city.population)}</strong>
                </div>
                <div>
                  <span className="detail-label">نقاط الحدود الجغرافية</span>
                  <strong>{formatNumber(city.zone.length)}</strong>
                </div>
                <div>
                  <span className="detail-label">أضيفت بواسطة</span>
                  <strong>{city.createdByName || viewerName}</strong>
                </div>
              </div>
              <p className="city-notes">{city.strategicNotes}</p>
              <div className="competitor-list">
                {city.competitors.length === 0 ? (
                  <span className="muted">لا يوجد منافسون مسجلون.</span>
                ) : (
                  city.competitors.map((competitor) => (
                    <span key={competitor.name} className="chip">
                      {competitor.name}
                      <em>{STRENGTH_LABEL[competitor.marketStrength]}</em>
                    </span>
                  ))
                )}
              </div>
              {canManage ? (
                <div className="row-actions">
                  <button
                    type="button"
                    className="button button-small button-quiet"
                    onClick={() => openEdit(city)}
                  >
                    تعديل المدينة
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <Modal
        open={open}
        title={editingId ? "تعديل مدينة" : "إضافة مدينة"}
        eyebrow="التوسع الجغرافي"
        description="ارسم النطاق التشغيلي ثم أدخل معلومات السوق التي يحتاجها الفريق الميداني."
        onClose={() => {
          setOpen(false);
          reset();
        }}
        wide
      >
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>اسم المدينة</span>
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="القاهرة"
                required
              />
            </label>
            <label className="field">
              <span>الدولة</span>
              <input
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                placeholder="مصر"
                required
              />
            </label>
            <label className="field">
              <span>عدد السكان</span>
              <input
                type="number"
                min={1}
                value={form.population}
                onChange={(event) => update("population", event.target.value)}
                placeholder="10100000"
                required
              />
            </label>
            <label className="field">
              <span>مرحلة المدينة</span>
              <select
                value={form.stage}
                onChange={(event) =>
                  update("stage", event.target.value as CityStage)
                }
              >
                {CITY_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {CITY_STAGE_META[stage].label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {CITY_STAGE_META[form.stage].description}
              </span>
            </label>
          </div>

          <div className="field">
            <span>النطاق التشغيلي</span>
            <p className="field-hint">
              اضغط على الخريطة لإضافة نقاط الحدود. تُغلق المضلعات تلقائياً عند
              الوصول إلى ثلاث نقاط أو أكثر.
            </p>
            <CityMap
              draft={zone}
              editable
              onAddPoint={(point) => setZone((current) => [...current, point])}
              height={300}
              center={[30.0444, 31.2357]}
              zoom={10}
            />
            <div className="row-actions zone-actions">
              <span className="badge">{zone.length} نقطة</span>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() => setZone((current) => current.slice(0, -1))}
                disabled={zone.length === 0}
              >
                تراجع عن نقطة
              </button>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() => setZone([])}
                disabled={zone.length === 0}
              >
                مسح النطاق
              </button>
            </div>
          </div>

          <label className="field">
            <span>ملاحظات استراتيجية</span>
            <textarea
              rows={3}
              value={form.strategicNotes}
              onChange={(event) => update("strategicNotes", event.target.value)}
              placeholder="أولويات التغطية والمنافسة وخطة الانتشار."
            />
          </label>

          <div className="field">
            <div className="field-head">
              <span>المنافسون</span>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={addCompetitor}
              >
                إضافة منافس
              </button>
            </div>
            {form.competitors.length === 0 ? (
              <p className="field-hint">
                اختياري. أضف اللاعبين الذين يجب أن يراقبهم الفريق الميداني.
              </p>
            ) : (
              <div className="stack-list">
                {form.competitors.map((competitor, index) => (
                  <div key={index} className="competitor-row">
                    <input
                      value={competitor.name}
                      placeholder="اسم المنافس"
                      onChange={(event) =>
                        updateCompetitor(index, { name: event.target.value })
                      }
                      required
                    />
                    <input
                      value={competitor.page}
                      placeholder="https://competitor.example"
                      onChange={(event) =>
                        updateCompetitor(index, { page: event.target.value })
                      }
                    />
                    <select
                      value={competitor.marketStrength}
                      onChange={(event) =>
                        updateCompetitor(index, {
                          marketStrength: event.target.value as MarketStrength,
                        })
                      }
                    >
                      {(["low", "medium", "high"] as const).map((level) => (
                        <option key={level} value={level}>
                          {STRENGTH_LABEL[level]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-small button-danger"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          competitors: current.competitors.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                    >
                      إزالة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
            >
              {saving
                ? "جارٍ الحفظ..."
                : editingId
                  ? "حفظ التعديلات"
                  : "إنشاء المدينة"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
