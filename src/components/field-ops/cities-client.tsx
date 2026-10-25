"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CityMap } from "@/components/field-ops/city-map";
import { Modal } from "@/components/field-ops/modal";
import {
  CITY_STATUSES,
  CITY_STATUS_META,
  type City,
  type CityStatus,
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
  status: CityStatus;
  strategicNotes: string;
  competitors: Array<Omit<Competitor, "marketStrength"> & { marketStrength: MarketStrength }>;
};

const EMPTY_FORM: FormState = {
  name: "",
  country: "Egypt",
  population: "",
  status: "planning",
  strategicNotes: "",
  competitors: [],
};

const STRENGTH_LABEL: Record<MarketStrength, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function CitiesClient({
  initialCities,
  canManage,
  viewerName,
}: CitiesClientProps) {
  const router = useRouter();
  const [cities, setCities] = useState(initialCities);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [zone, setZone] = useState<ZonePoint[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const population = cities.reduce((sum, city) => sum + city.population, 0);
    const competitors = new Set(
      cities.flatMap((city) => city.competitors.map((item) => item.name)),
    );
    const active = cities.filter((city) => city.status === "active").length;
    return { population, competitors: competitors.size, active };
  }, [cities]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(EMPTY_FORM);
    setZone([]);
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (zone.length < 3) {
      setError("Draw at least three zone vertices on the map.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/field-ops/cities", {
        method: "POST",
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
        throw new Error(payload.error ?? "Could not create the city.");
      }
      setCities((current) =>
        [...current, payload.city as City].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setOpen(false);
      reset();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create the city.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="stat-grid">
        <div className="stat-card">
          <p className="eyebrow">Live cities</p>
          <strong className="stat-value">{cities.length}</strong>
          <span className="stat-hint">{totals.active} active operations</span>
        </div>
        <div className="stat-card">
          <p className="eyebrow">Covered population</p>
          <strong className="stat-value">
            {(totals.population / 1_000_000).toFixed(1)}M
          </strong>
          <span className="stat-hint">Across all zoned cities</span>
        </div>
        <div className="stat-card">
          <p className="eyebrow">Competitor watchlist</p>
          <strong className="stat-value">{totals.competitors}</strong>
          <span className="stat-hint">Distinct market players</span>
        </div>
        <div className="stat-card">
          <p className="eyebrow">Zoned territory</p>
          <strong className="stat-value">
            {cities.reduce((sum, city) => sum + city.zone.length, 0)}
          </strong>
          <span className="stat-hint">Polygon vertices mapped</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Operational geography</p>
            <h2>City zones and market intelligence</h2>
          </div>
          {canManage ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setOpen(true)}
            >
              Add city
            </button>
          ) : null}
        </div>
        <CityMap
          cities={cities.map((city) => ({
            id: city.id,
            name: city.name,
            status: city.status,
            zone: city.zone,
          }))}
          height={360}
          center={[30.05, 31.15]}
          zoom={9}
        />
        <p className="panel-note">
          Zones are drawn as geographic polygons. Select a city below to review
          its launch status, population, and competitive landscape.
        </p>
      </section>

      <section className="city-grid">
        {cities.map((city) => {
          const meta = CITY_STATUS_META[city.status];
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
                  <span className="detail-label">Population</span>
                  <strong>{(city.population / 1_000_000).toFixed(2)}M</strong>
                </div>
                <div>
                  <span className="detail-label">Zone vertices</span>
                  <strong>{city.zone.length}</strong>
                </div>
                <div>
                  <span className="detail-label">Added by</span>
                  <strong>{city.createdByName || viewerName}</strong>
                </div>
              </div>
              <p className="city-notes">{city.strategicNotes}</p>
              <div className="competitor-list">
                {city.competitors.length === 0 ? (
                  <span className="muted">No competitors recorded.</span>
                ) : (
                  city.competitors.map((competitor) => (
                    <span key={competitor.name} className="chip">
                      {competitor.name}
                      <em>{STRENGTH_LABEL[competitor.marketStrength]}</em>
                    </span>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </section>

      <Modal
        open={open}
        title="Add a city"
        eyebrow="Market expansion"
        description="Draw the operational polygon, then capture the market intelligence that field teams need."
        onClose={() => {
          setOpen(false);
          reset();
        }}
        wide
      >
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>City name</span>
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Cairo"
                required
              />
            </label>
            <label className="field">
              <span>Country</span>
              <input
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                placeholder="Egypt"
                required
              />
            </label>
            <label className="field">
              <span>Population</span>
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
              <span>Launch status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  update("status", event.target.value as CityStatus)
                }
              >
                {CITY_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CITY_STATUS_META[status].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            <span>Operational zone</span>
            <p className="field-hint">
              Click the map to place vertices. Three or more points close the
              polygon automatically.
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
              <span className="badge">{zone.length} points</span>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() => setZone((current) => current.slice(0, -1))}
                disabled={zone.length === 0}
              >
                Undo point
              </button>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() => setZone([])}
                disabled={zone.length === 0}
              >
                Clear zone
              </button>
            </div>
          </div>

          <label className="field">
            <span>Strategic notes</span>
            <textarea
              rows={3}
              value={form.strategicNotes}
              onChange={(event) => update("strategicNotes", event.target.value)}
              placeholder="Prioritise the central corridor and premium seafood coverage."
            />
          </label>

          <div className="field">
            <div className="field-head">
              <span>Competitors</span>
              <button
                type="button"
                className="button button-small button-quiet"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    competitors: [
                      ...current.competitors,
                      { name: "", page: "", marketStrength: "medium" },
                    ],
                  }))
                }
              >
                Add competitor
              </button>
            </div>
            {form.competitors.length === 0 ? (
              <p className="field-hint">
                Optional. Add the market players field teams should watch.
              </p>
            ) : (
              <div className="stack-list">
                {form.competitors.map((competitor, index) => (
                  <div key={index} className="competitor-row">
                    <input
                      value={competitor.name}
                      placeholder="Competitor name"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          competitors: current.competitors.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                      required
                    />
                    <input
                      value={competitor.page}
                      placeholder="https://competitor.example"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          competitors: current.competitors.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, page: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <select
                      value={competitor.marketStrength}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          competitors: current.competitors.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  marketStrength: event.target
                                    .value as MarketStrength,
                                }
                              : item,
                          ),
                        }))
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
                      Remove
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
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
            >
              {saving ? "Creating city..." : "Create city"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
