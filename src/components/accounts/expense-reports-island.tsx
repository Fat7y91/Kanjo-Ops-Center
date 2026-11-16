"use client";

import { useEffect, useState } from "react";

import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import type { ExpenseReport } from "@/lib/accounts/expense-reports";

type Status = "loading" | "ready" | "failed";

type Applied = { from: string; to: string; categoryId: string };

function endpoint(applied: Applied): string {
  const params = new URLSearchParams();
  if (applied.from) params.set("from", applied.from);
  if (applied.to) params.set("to", applied.to);
  if (applied.categoryId) params.set("category", applied.categoryId);
  const query = params.toString();
  return `/api/finance/expense-reports${query ? `?${query}` : ""}`;
}

export function ExpenseReportsIsland() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [applied, setApplied] = useState<Applied>({
    from: "",
    to: "",
    categoryId: "",
  });
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ExpenseReport | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError("");

    fetch(endpoint(applied), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | ExpenseReport
          | { error?: string };
        if (!response.ok) {
          throw new Error(
            "error" in payload ? payload.error : "تعذر تحميل التقارير.",
          );
        }
        setData(payload as ExpenseReport);
        setStatus("ready");
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "تعذر تحميل التقارير.",
        );
        setStatus("failed");
      });

    return () => controller.abort();
  }, [applied, attempt]);

  function apply() {
    setApplied({ from, to, categoryId });
  }

  function reset() {
    setFrom("");
    setTo("");
    setCategoryId("");
    setApplied({ from: "", to: "", categoryId: "" });
  }

  return (
    <div className="expense-report">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">التصفية</p>
            <h2>نطاق التقرير</h2>
          </div>
          <span className="badge">
            {data ? `${data.totals.count} حركة` : "…"}
          </span>
        </div>
        <div className="expense-report-filters">
          <TextField
            label="من تاريخ"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <TextField
            label="إلى تاريخ"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <SelectMenu
            label="البند الرئيسي"
            value={categoryId}
            onChange={setCategoryId}
            options={[
              { value: "", label: "كل البنود" },
              ...(data?.categories ?? []).map((category) => ({
                value: category.id,
                label: category.nameAr,
                hint: category.active ? undefined : "غير نشط",
              })),
            ]}
          />
          <div className="expense-report-actions">
            <Button size="sm" onClick={apply}>
              تطبيق
            </Button>
            <Button size="sm" variant="quiet" onClick={reset}>
              إعادة ضبط
            </Button>
          </div>
        </div>
      </section>

      {status === "failed" ? (
        <section className="panel">
          <p className="form-error" role="alert">
            {error}
          </p>
          <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
            إعادة المحاولة
          </Button>
        </section>
      ) : null}

      {data ? (
        <Widget eyebrow="الإجماليات" title="المصروفات حسب العملة" span={12}>
          <div className="accounts-totals">
            <div className="accounts-total">
              <WidgetStat
                label="مصروفات الجنيه"
                value={currencyMoney(data.totals.egp, "EGP")}
                detail="من قيود اليومية المصنّفة"
              />
              <WidgetDivider />
            </div>
            <div className="accounts-total">
              <WidgetStat
                label="مصروفات الريال"
                value={currencyMoney(data.totals.sar, "SAR")}
                detail="من مصروفات البنك السعودي"
              />
              <WidgetDivider />
            </div>
          </div>
        </Widget>
      ) : null}

      <section className="panel" aria-busy={status === "loading"}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">التجميع</p>
            <h2>الإجمالي حسب البند الرئيسي</h2>
          </div>
          {status === "loading" ? <span className="badge">جارٍ التحميل…</span> : null}
        </div>
        {data && data.groups.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>البند الرئيسي</th>
                  <th>مصروفات الجنيه</th>
                  <th>مصروفات الريال</th>
                  <th>عدد الحركات</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((group) => (
                  <tr key={group.categoryId}>
                    <td>{group.categoryName}</td>
                    <td>{currencyMoney(group.egp, "EGP")}</td>
                    <td>{currencyMoney(group.sar, "SAR")}</td>
                    <td>{group.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>الإجمالي</th>
                  <th>{currencyMoney(data.totals.egp, "EGP")}</th>
                  <th>{currencyMoney(data.totals.sar, "SAR")}</th>
                  <th>{data.totals.count}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : status === "ready" ? (
          <p className="empty-state">لا توجد مصروفات مطابقة للنطاق المختار.</p>
        ) : null}
      </section>

      <section className="panel" aria-busy={status === "loading"}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">التفاصيل</p>
            <h2>حركات المصروفات</h2>
          </div>
          <span className="badge">{data ? `${data.lines.length} سجل` : "…"}</span>
        </div>
        {data && data.lines.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>البند الرئيسي</th>
                  <th>العملة</th>
                  <th>المبلغ</th>
                  <th>البيان</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{shortDate(line.occurredOn)}</td>
                    <td>{line.categoryName}</td>
                    <td>
                      <span className="badge">{line.currency}</span>
                    </td>
                    <td>{currencyMoney(line.amount, line.currency)}</td>
                    <td>{line.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : status === "ready" ? (
          <p className="empty-state">لا توجد حركات لعرضها.</p>
        ) : null}
      </section>
    </div>
  );
}
