"use client";

import { useCallback, useState } from "react";

import { ContractDraftEditor } from "@/components/contracts/contract-draft-editor";
import { useDraftEditor } from "@/components/contracts/use-draft-editor";
import { useEndpointData } from "@/components/data/use-endpoint-data";
import { ErrorPanel } from "@/components/ui/error-panel";
import { TableSkeleton } from "@/components/ui/skeletons";
import {
  draftFromTerms,
  termsFromDraft,
  type ContractDraft,
  type ContractTerms,
} from "@/lib/contracts/draft-editor";
import type { Contract } from "@/lib/contracts/types";

type TermsPayload = { contract: Contract; terms: ContractTerms | null };

const parseTerms = (input: unknown): TermsPayload => input as TermsPayload;

/**
 * Editor loader island.
 *
 * Fetches the contract and its stored terms, then mounts the editor with a
 * stable seed derived from the server data. The editor is only mounted once the
 * data is ready, so `useDraftEditor` seeds exactly once and hydration never
 * overwrites an in-progress edit.
 */
export function ContractDraftEditorIsland({ contractId }: { contractId: string }) {
  const { status, data, error, reload } = useEndpointData(
    `/api/contracts/${contractId}/terms`,
    parseTerms,
  );

  if (status === "loading") {
    return <TableSkeleton rows={5} columns={1} />;
  }

  if (status === "failed") {
    return (
      <ErrorPanel
        error={error}
        reset={reload}
        title="تعذر تحميل مسودة العقد"
        description="لم تكتمل قراءة شروط العقد. أعد المحاولة دون مغادرة الصفحة."
      />
    );
  }

  const seed = draftFromTerms(
    data.contract.merchantName,
    data.terms ?? {
      baseCommission: null,
      preamble: null,
      copiesNote: null,
      firstPartyRows: null,
      secondPartyRows: null,
      summaryNote: null,
      clauses: [],
      commissionLines: [],
    },
  );

  return <EditorLoader contract={data.contract} seed={seed} />;
}

/** Mounts the editor after the seed is known, owns the save round-trip. */
function EditorLoader({ contract, seed }: { contract: Contract; seed: ContractDraft }) {
  const editor = useDraftEditor(seed);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/contracts/${contract.id}/terms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: termsFromDraft(editor.draft) }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر حفظ المسودة.");
      return "تم حفظ المسودة.";
    } finally {
      setSaving(false);
    }
  }, [contract.id, editor.draft]);

  return (
    <ContractDraftEditor
      editor={editor}
      contract={contract}
      saving={saving}
      onSave={save}
    />
  );
}
