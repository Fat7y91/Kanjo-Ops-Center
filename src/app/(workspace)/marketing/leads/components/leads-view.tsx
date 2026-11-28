"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import { TextField } from "@/components/ui/form-inputs";
import { formatDateTime } from "@/lib/field-ops/format";
import { telLink } from "@/lib/field-ops/phone";
import {
  LEAD_SOURCE_META,
  LEAD_STATUSES,
  LEAD_STATUS_META,
  leadStatusMeta,
  type LeadStatus,
  type MarketingLead,
} from "@/lib/marketing-leads/types";

type CampaignOption = { id: string; name: string };

type LeadsViewProps = {
  initialLeads: MarketingLead[];
  campaigns: CampaignOption[];
  canManage: boolean;
  unavailable: boolean;
};

const ALL = "__all__";

const STATUS_OPTIONS = LEAD_STATUSES.map((status) => ({
  value: status,
  label: LEAD_STATUS_META[status].label,
}));

/**
 * Lead triage queue.
 *
 * A non-manager sees the queue read-only. A manager moves a lead's status and
 * saves notes; both go through the API so the SQL check constraint is the final
 * authority on which transitions are legal.
 */
export function LeadsView({
  initialLeads,
  campaigns,
  canManage,
  unavailable,
}: LeadsViewProps) {
  const [leads, setLeads] = useState<MarketingLead[]>(initialLeads);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== ALL && lead.status !== statusFilter) return false;
      if (!needle) return true;
      return [lead.phoneNumber, lead.promoCode, lead.userGuess, lead.notes]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [leads, statusFilter, search]);

  async function patchLead(
    id: string,
    patch: { status?: LeadStatus; notes?: string; campaignId?: string | null },
  ) {
    setBusyId(id);
    setError("");
    setNotice("");
    const before = leads;
    setLeads((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)),
    );
    try {
      const response = await fetch(`/api/marketing/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as {
        lead?: MarketingLead;
        error?: string;
      };
      if (!response.ok || !payload.lead) {
        setLeads(before);
        setError(payload.error ?? "تعذر تحديث العميل.");
        return;
      }
      setLeads((current) =>
        current.map((lead) => (lead.id === id ? payload.lead! : lead)),
      );
      setNotice("تم تحديث العميل.");
    } catch {
      setLeads(before);
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusyId(null);
    }
  }

  if (unavailable) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>السجل غير مفعّل</h2>
        </div>
        <p className="muted">
          لم يُطبَّق ترحيل عملاء الحملات على هذه البيئة بعد.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="governance-filters">
        <SelectMenu
          label="الحالة"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: ALL, label: "كل الحالات" },
            ...STATUS_OPTIONS,
          ]}
        />
        <TextField
          label="بحث"
          placeholder="رقم الهاتف أو كود الخصم"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <section className="panel">
        <div className="panel-head">
          <h2>قائمة العملاء</h2>
          <span className="muted">{visible.length} عميل</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الهاتف</th>
                <th>المصدر</th>
                <th>الحملة</th>
                <th>كود الخصم</th>
                <th>التخمين</th>
                <th>الحالة</th>
                <th>التاريخ</th>
                <th className="align-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => {
                const meta = leadStatusMeta(lead.status);
                const call = telLink(`+${lead.phoneNumber}`);
                return (
                  <tr key={lead.id}>
                    <td dir="ltr">
                      {call ? (
                        <a href={call}>+{lead.phoneNumber}</a>
                      ) : (
                        `+${lead.phoneNumber}`
                      )}
                    </td>
                    <td>{LEAD_SOURCE_META[lead.source]}</td>
                    <td>{lead.campaignName ?? "—"}</td>
                    <td dir="ltr">{lead.promoCode || "—"}</td>
                    <td>{lead.userGuess || "—"}</td>
                    <td>
                      {canManage ? (
                        <SelectMenu
                          ariaLabel="حالة العميل"
                          value={lead.status}
                          onChange={(value) =>
                            patchLead(lead.id, { status: value })
                          }
                          options={STATUS_OPTIONS}
                          disabled={busyId === lead.id}
                        />
                      ) : (
                        <span className={`badge ${meta.tone}`.trim()}>
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td>{formatDateTime(lead.occurredAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => {
                            const notes = window.prompt(
                              "ملاحظات المتابعة",
                              lead.notes,
                            );
                            if (notes !== null) {
                              void patchLead(lead.id, { notes });
                            }
                          }}
                          disabled={!canManage || busyId === lead.id}
                        >
                          ملاحظات
                        </Button>
                      </div>
                      {canManage && campaigns.length > 0 ? (
                        <div style={{ marginTop: 6 }}>
                          <SelectMenu
                            ariaLabel="ربط بحملة"
                            value={lead.campaignId ?? ""}
                            onChange={(value) =>
                              patchLead(lead.id, {
                                campaignId: value || null,
                              })
                            }
                            options={[
                              { value: "", label: "بدون حملة" },
                              ...campaigns.map((campaign) => ({
                                value: campaign.id,
                                label: campaign.name,
                              })),
                            ]}
                            disabled={busyId === lead.id}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <p className="empty-state">لا يوجد عملاء مطابقون.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
