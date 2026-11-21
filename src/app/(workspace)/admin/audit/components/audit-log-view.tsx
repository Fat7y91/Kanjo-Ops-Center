"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import { TextField } from "@/components/ui/form-inputs";
import { formatDateTime } from "@/lib/field-ops/format";
import type { AuditLog } from "@/lib/audit/types";

type AuditLogViewProps = {
  initialLogs: AuditLog[];
  collections: string[];
  unavailable: boolean;
};

const ALL = "__all__";

function pretty(value: Record<string, unknown> | null): string {
  if (!value) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Audit feed with client-side filtering.
 *
 * Filtering happens over the rows the server already authorized and returned,
 * so the client cannot ask for a collection it is not allowed to see: the
 * server's read is the grant.
 */
export function AuditLogView({
  initialLogs,
  collections,
  unavailable,
}: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [collection, setCollection] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function reload(nextCollection: string) {
    setBusy(true);
    setError("");
    try {
      const query =
        nextCollection === ALL
          ? ""
          : `?collection=${encodeURIComponent(nextCollection)}`;
      const response = await fetch(`/api/audit${query}`);
      const payload = (await response.json()) as {
        logs?: AuditLog[];
        error?: string;
      };
      if (!response.ok || !payload.logs) {
        setError(payload.error ?? "تعذر تحميل سجل التدقيق.");
        return;
      }
      setLogs(payload.logs);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (collection !== ALL && log.collection !== collection) return false;
      if (!needle) return true;
      return [
        log.actorName,
        log.actionType,
        log.targetName,
        log.targetId,
        log.description,
        log.collection,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [logs, collection, search]);

  if (unavailable) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>السجل غير مفعّل</h2>
        </div>
        <p className="muted">
          لم يُطبَّق ترحيل سجل التدقيق على هذه البيئة بعد، لذلك لا توجد قيود
          لعرضها.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="governance-filters">
        <SelectMenu
          label="المجموعة"
          value={collection}
          onChange={(value) => {
            setCollection(value);
            void reload(value);
          }}
          options={[
            { value: ALL, label: "كل المجموعات" },
            ...collections.map((item) => ({ value: item, label: item })),
          ]}
        />
        <TextField
          label="بحث"
          placeholder="اسم الفاعل أو الهدف أو نوع الإجراء"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <div className="panel-head">
          <h2>أحدث القيود</h2>
          <span className="muted">
            {busy ? "جارٍ التحديث…" : `${visible.length} قيد`}
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>الفاعل</th>
                <th>الإجراء</th>
                <th>الهدف</th>
                <th>المجموعة</th>
                <th className="align-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.occurredAt)}</td>
                  <td>
                    <strong>{log.actorName || "غير معروف"}</strong>
                    {log.actorRole ? (
                      <span className="muted"> · {log.actorRole}</span>
                    ) : null}
                  </td>
                  <td>{log.actionType || "—"}</td>
                  <td>
                    {log.targetName || log.targetId || "—"}
                    {log.entityKind ? (
                      <span className="muted"> · {log.entityKind}</span>
                    ) : null}
                  </td>
                  <td>{log.collection || "—"}</td>
                  <td>
                    <div className="row-actions">
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() =>
                          setExpanded((current) =>
                            current === log.id ? null : log.id,
                          )
                        }
                      >
                        {expanded === log.id ? "إخفاء" : "عرض"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="empty-state">لا توجد قيود مطابقة.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {expanded ? <AuditDetail log={visible.find((log) => log.id === expanded)} /> : null}
      </section>
    </>
  );
}

function AuditDetail({ log }: { log: AuditLog | undefined }) {
  if (!log) return null;
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panel-head">
        <h2>{log.targetName || log.targetId || log.actionType}</h2>
        <span className="muted">{formatDateTime(log.occurredAt)}</span>
      </div>
      {log.description ? <p className="muted">{log.description}</p> : null}
      <div className="audit-diff">
        <div>
          <span className="audit-diff-label">قبل</span>
          <pre>{pretty(log.previousData)}</pre>
        </div>
        <div>
          <span className="audit-diff-label">بعد</span>
          <pre>{pretty(log.newData)}</pre>
        </div>
        <div>
          <span className="audit-diff-label">التغييرات</span>
          <pre>{pretty(log.changes)}</pre>
        </div>
      </div>
    </div>
  );
}
