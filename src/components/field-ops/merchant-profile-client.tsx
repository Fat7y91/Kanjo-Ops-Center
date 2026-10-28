"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  JustificationModal,
  SignContractModal,
  StateModal,
} from "@/components/field-ops/request-modals";
import {
  VisitEngine,
  type VisitEngineTarget,
} from "@/components/field-ops/visit-engine";
import type {
  MerchantCrmSummary,
  MerchantTimelineEntry,
} from "@/lib/field-ops/store";
import type {
  FieldTask,
  FollowUpTask,
  Merchant,
  StateOverride,
  VisitReport,
} from "@/lib/field-ops/types";

import { CrmMetrics } from "./merchant-profile/crm-metrics";
import { DocumentsPanel } from "./merchant-profile/documents-panel";
import { EconomicsPanel } from "./merchant-profile/economics-panel";
import { ProfileHero } from "./merchant-profile/profile-hero";
import { TasksFollowups } from "./merchant-profile/tasks-followups";
import { TimelinePanel } from "./merchant-profile/timeline-panel";
import { VisitHistory } from "./merchant-profile/visit-history";

type MerchantProfileClientProps = {
  merchant: Merchant;
  cityName: string;
  reports: VisitReport[];
  overrides: StateOverride[];
  tasks: FieldTask[];
  followUps: FollowUpTask[];
  timeline: MerchantTimelineEntry[];
  summary: MerchantCrmSummary;
  visitCount: number;
  viewerTeam: string;
  canEditMerchants: boolean;
  canRequestTransfers: boolean;
  canManageState: boolean;
  canViewFieldOps: boolean;
  canViewFieldOpsPage: boolean;
  canStartVisit: boolean;
};

export function MerchantProfileClient({
  merchant,
  cityName,
  reports,
  overrides,
  tasks,
  followUps,
  timeline,
  summary,
  visitCount,
  viewerTeam,
  canEditMerchants,
  canRequestTransfers,
  canManageState,
  canViewFieldOps,
  canViewFieldOpsPage,
  canStartVisit,
}: MerchantProfileClientProps) {
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [visitTarget, setVisitTarget] = useState<VisitEngineTarget | null>(null);

  const otherTeam = Boolean(merchant.team) && merchant.team !== viewerTeam;
  const agreementReached =
    merchant.contractState === "final_contract" ||
    merchant.contractState === "signed_contract";

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 4500);
  }

  function openVisit() {
    setVisitTarget({ merchant, taskId: null, visitCount });
  }

  function refreshWith(message: string) {
    announce(message);
    router.refresh();
  }

  return (
    <>
      <ProfileHero
        merchant={merchant}
        cityName={cityName}
        visitCount={visitCount}
        otherTeam={otherTeam}
        canStartVisit={canStartVisit}
        canViewFieldOpsPage={canViewFieldOpsPage}
        canRequestTransfers={canRequestTransfers}
        canManageState={canManageState}
        onStartVisit={openVisit}
        onRequestTransfer={() => setTransferOpen(true)}
        onOverrideState={() => setStateOpen(true)}
      />

      <CrmMetrics summary={summary} followUps={followUps} />

      <section className="profile-grid">
        <VisitHistory merchant={merchant} summary={summary} />
        <EconomicsPanel
          merchant={merchant}
          canViewFieldOps={canViewFieldOps}
          otherTeam={otherTeam}
          onRequestEdit={() => setEditOpen(true)}
          onOpenSign={() => setSignOpen(true)}
        />
      </section>

      <TimelinePanel
        merchant={merchant}
        timeline={timeline}
        summary={summary}
      />

      <section className="profile-grid">
        <DocumentsPanel
          merchant={merchant}
          agreementReached={agreementReached}
          canEditMerchants={canEditMerchants}
          onAnnounce={announce}
        />
        <TasksFollowups
          merchant={merchant}
          summary={summary}
          tasks={tasks}
          followUps={followUps}
          overrides={overrides}
          reports={reports}
        />
      </section>

      <VisitEngine
        target={visitTarget}
        canManageState={canManageState}
        onClose={() => setVisitTarget(null)}
        onSaved={(message) => {
          announce(message);
          // A server refresh while offline would hard-navigate to a browser
          // network error page. The queued visit renders from the local queue
          // banner instead, and the next online refresh picks up the server
          // state.
          if (typeof navigator === "undefined" || navigator.onLine) {
            router.refresh();
          }
        }}
      />

      <JustificationModal
        open={transferOpen}
        endpoint={`/api/field-ops/merchants/${merchant.id}/transfers`}
        title={`نقل ملكية ${merchant.name}`}
        eyebrow="ملكية عابرة للفرق"
        description="يراجع المدير هذا المبرر قبل انتقال الملكية."
        label="المبرر"
        placeholder="لماذا يجب أن ينتقل هذا التاجر إلى فريقك؟"
        submitLabel="إرسال طلب النقل"
        field="justification"
        successMessage="تم إرسال طلب النقل لاعتماد المدير."
        onClose={() => setTransferOpen(false)}
        onDone={refreshWith}
      />

      <JustificationModal
        open={editOpen}
        endpoint={`/api/field-ops/merchants/${merchant.id}/edit-requests`}
        title={`فتح تعديل ${merchant.name}`}
        eyebrow="قفل الاتفاق النهائي"
        description="يجب أن يعتمد المدير السبب قبل تغيير النتيجة."
        label="سبب التعديل"
        placeholder="ما الخطأ، وما الذي يجب تغييره؟"
        submitLabel="طلب اعتماد التعديل"
        field="reason"
        successMessage="تم إرسال طلب التعديل لاعتماد المدير."
        onClose={() => setEditOpen(false)}
        onDone={refreshWith}
      />

      <StateModal
        open={stateOpen}
        merchantName={merchant.name}
        current={merchant.contractState}
        endpoint={`/api/field-ops/merchants/${merchant.id}/state`}
        onClose={() => setStateOpen(false)}
        onDone={refreshWith}
      />

      <SignContractModal
        open={signOpen}
        merchantName={merchant.name}
        currentCommission={merchant.agreedCommission ?? merchant.targetCommission}
        suggestedCommission={merchant.targetCommission}
        endpoint={`/api/field-ops/merchants/${merchant.id}/state`}
        onClose={() => setSignOpen(false)}
        onDone={refreshWith}
      />

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
