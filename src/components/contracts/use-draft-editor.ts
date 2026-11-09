"use client";

import { useCallback, useMemo, useState } from "react";

import {
  draftId,
  type ContractDraft,
  type DraftClause,
  type DraftCommissionLine,
} from "@/lib/contracts/draft-editor";

export type DraftEditorController = {
  draft: ContractDraft;
  dirty: boolean;
  /** Clause count the operator has disabled; shown in the summary strip. */
  disabledCount: number;
  totalCommissionRows: number;
  updateClause: (id: string, patch: Partial<Omit<DraftClause, "id">>) => void;
  addClause: () => void;
  removeClause: (id: string) => void;
  moveClause: (id: string, direction: -1 | 1) => void;
  toggleClause: (id: string) => void;
  addCommissionLine: () => void;
  updateCommissionLine: (
    id: string,
    patch: Partial<Omit<DraftCommissionLine, "id">>,
  ) => void;
  removeCommissionLine: (id: string) => void;
  setBaseCommission: (value: number) => void;
  reset: () => void;
};

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Local editor state.
 *
 * Clauses and commission rows are held in local memory only; every mutation is
 * an immutable update so the review UI behaves exactly as it will once wired to
 * a save endpoint. `dirty` flips on the first change so the shell can guard
 * against discarding edits.
 */
export function useDraftEditor(seed: ContractDraft): DraftEditorController {
  const [draft, setDraft] = useState<ContractDraft>(seed);
  const [dirty, setDirty] = useState(false);

  const commit = useCallback((updater: (current: ContractDraft) => ContractDraft) => {
    setDraft((current) => updater(current));
    setDirty(true);
  }, []);

  const updateClause: DraftEditorController["updateClause"] = useCallback(
    (id, patch) =>
      commit((current) => ({
        ...current,
        clauses: current.clauses.map((clause) =>
          clause.id === id ? { ...clause, ...patch } : clause,
        ),
      })),
    [commit],
  );

  const addClause = useCallback(
    () =>
      commit((current) => ({
        ...current,
        clauses: [
          ...current.clauses,
          {
            id: draftId("clause"),
            title: "بند جديد",
            body: "",
            enabled: true,
          },
        ],
      })),
    [commit],
  );

  const removeClause = useCallback(
    (id: string) =>
      commit((current) => ({
        ...current,
        clauses: current.clauses.filter((clause) => clause.id !== id),
      })),
    [commit],
  );

  const moveClause = useCallback(
    (id: string, direction: -1 | 1) =>
      commit((current) => {
        const index = current.clauses.findIndex((clause) => clause.id === id);
        if (index < 0) return current;
        return {
          ...current,
          clauses: move(current.clauses, index, index + direction),
        };
      }),
    [commit],
  );

  const toggleClause = useCallback(
    (id: string) =>
      commit((current) => ({
        ...current,
        clauses: current.clauses.map((clause) =>
          clause.id === id ? { ...clause, enabled: !clause.enabled } : clause,
        ),
      })),
    [commit],
  );

  const addCommissionLine = useCallback(
    () =>
      commit((current) => ({
        ...current,
        commissionLines: [
          ...current.commissionLines,
          { id: draftId("line"), category: "", rate: 0 },
        ],
      })),
    [commit],
  );

  const updateCommissionLine: DraftEditorController["updateCommissionLine"] =
    useCallback(
      (id, patch) =>
        commit((current) => ({
          ...current,
          commissionLines: current.commissionLines.map((line) =>
            line.id === id ? { ...line, ...patch } : line,
          ),
        })),
      [commit],
    );

  const removeCommissionLine = useCallback(
    (id: string) =>
      commit((current) => ({
        ...current,
        commissionLines: current.commissionLines.filter((line) => line.id !== id),
      })),
    [commit],
  );

  const setBaseCommission = useCallback(
    (value: number) =>
      commit((current) => ({ ...current, baseCommission: value })),
    [commit],
  );

  const reset = useCallback(() => {
    setDraft(seed);
    setDirty(false);
  }, [seed]);

  const disabledCount = useMemo(
    () => draft.clauses.filter((clause) => !clause.enabled).length,
    [draft.clauses],
  );

  return {
    draft,
    dirty,
    disabledCount,
    totalCommissionRows: draft.commissionLines.length,
    updateClause,
    addClause,
    removeClause,
    moveClause,
    toggleClause,
    addCommissionLine,
    updateCommissionLine,
    removeCommissionLine,
    setBaseCommission,
    reset,
  };
}
