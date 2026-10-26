"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { smartTextScore } from "@/lib/search/normalize";

export type MerchantRow = {
  id: string;
  name: string;
  vendorType: string;
  vendorTypeId: number;
  cityName: string;
  teamLabel: string;
  stateLabel: string;
  stateTone: string;
  commissionLabel: string;
};

type MerchantsDirectoryProps = {
  rows: MerchantRow[];
  initialQuery: string;
};

/**
 * Instant directory search.
 *
 * Filtering happens in the client against the already-streamed rows, so typing
 * never triggers a server round-trip or a document navigation. The query is
 * mirrored into the URL via history.replaceState so deep links and
 * back/forward stay correct without any full page reload.
 */
export function MerchantsDirectory({ rows, initialQuery }: MerchantsDirectoryProps) {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    const params = new URLSearchParams();
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    const target = params.toString() ? `/merchants?${params}` : "/merchants";

    if (target !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", target);
    }
  }, [query]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get("q") ?? "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const visibleRows = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return rows;

    return rows
      .map((row) => ({
        row,
        score: Math.max(
          smartTextScore(trimmed, row.name).score,
          smartTextScore(trimmed, row.vendorType).score,
          smartTextScore(trimmed, row.cityName).score,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.row);
  }, [rows, query]);

  return (
    <section className="panel">
      <div className="table-toolbar">
        <div className="search-shell">
          <span>بحث</span>
          <input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="اسم التاجر أو الإملاء العربي أو خطأ إملائي"
            aria-label="البحث عن التجار"
            autoComplete="off"
          />
        </div>
        <div className="row-actions">
          <span className="badge" aria-live="polite">
            {visibleRows.length} نتيجة
          </span>
          {query ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setQuery("")}
            >
              مسح
            </button>
          ) : null}
        </div>
      </div>

      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>التاجر</th>
              <th>المدينة</th>
              <th>الفريق المالك</th>
              <th>الحالة</th>
              <th>العمولة</th>
              <th className="align-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/merchants/${row.id}`} prefetch>
                    <strong>{row.name}</strong>
                  </Link>
                  <span className="muted merchant-category">
                    {row.vendorType} · ID {row.vendorTypeId}
                  </span>
                </td>
                <td>{row.cityName}</td>
                <td>
                  <span className="chip chip-team">{row.teamLabel}</span>
                </td>
                <td>
                  <span className={`badge ${row.stateTone}`}>
                    {row.stateLabel}
                  </span>
                </td>
                <td>{row.commissionLabel}</td>
                <td>
                  <div className="row-actions">
                    <Link
                      href={`/merchants/${row.id}`}
                      prefetch
                      className="button button-small button-quiet"
                    >
                      فتح الملف
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="empty-state">
                    {query.trim()
                      ? `لا يوجد تاجر مطابق لـ «${query.trim()}». جرّب إملاءً أقصر.`
                      : "لا يوجد تجار داخل نطاق مدنك بعد. استخدم زر «إضافة تاجر» لتسجيل أول تاجر."}
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
