"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import type {
  CustodyIssueResult,
  LocationCatalog,
  Rider,
} from "@/lib/riders/types";

import { IssueCustodyModal } from "./issue-custody-modal";
import { RidersDirectory } from "./riders-directory";
import { useRiders } from "./use-riders";

type RidersIslandProps = {
  initialRiders: Rider[];
  locations: LocationCatalog;
  canManage: boolean;
};

export function RidersIsland({
  initialRiders,
  locations,
  canManage,
}: RidersIslandProps) {
  const state = useRiders(initialRiders);
  const [lastIssued, setLastIssued] = useState<CustodyIssueResult | null>(null);

  useEffect(() => {
    if (!state.toast) return;
    const timer = window.setTimeout(state.dismissToast, 4500);
    return () => window.clearTimeout(timer);
  }, [state.toast, state.dismissToast]);

  function openIssue(rider: Rider | null) {
    setLastIssued(null);
    if (rider) {
      state.setIssuingFor(rider);
      return;
    }
    state.setCreating(true);
  }

  function handleIssued(result: CustodyIssueResult) {
    setLastIssued(result);
    void state.issued(
      `تم إصدار العهدة ${result.custodyNumber} للمندوب ${result.riderCode}.`,
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="المقاصة والعمليات"
        title="مناديب التوصيل والعهد"
        description="تسجيل المناديب وإصدار إيصالات العهدة وتسليم الأدوات والعهدة النقدية."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => openIssue(null)}>
              إصدار عهدة جديدة
            </Button>
          ) : null
        }
      />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      {lastIssued ? (
        <section className="riders-success" role="status">
          <div>
            <strong>تم إصدار الإيصال {lastIssued.custodyNumber}</strong>
            <p>يمكنك طباعة الإيصال الآن أو الرجوع إليه من الدليل لاحقاً.</p>
          </div>
          <div className="riders-success-actions">
            <Button
              variant="primary"
              size="sm"
              as="a"
              href={`/riders/custody/${lastIssued.receiptId}/print`}
              target="_blank"
              rel="noreferrer"
            >
              طباعة الإيصال
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastIssued(null)}
            >
              إخفاء
            </Button>
          </div>
        </section>
      ) : null}

      <RidersDirectory
        rows={state.visible}
        filters={state.filters}
        stats={state.stats}
        canManage={canManage}
        onFilter={state.setFilter}
        onIssue={(rider) => openIssue(rider)}
      />

      {state.creating || state.issuingFor ? (
        <IssueCustodyModal
          key={state.issuingFor?.id ?? "new"}
          locations={locations}
          initialRider={state.issuingFor}
          onClose={() => {
            state.setCreating(false);
            state.setIssuingFor(null);
          }}
          onIssued={handleIssued}
        />
      ) : null}

      {state.toast ? (
        <div className="toast" role="status">
          {state.toast}
        </div>
      ) : null}
    </>
  );
}
