"use client";

import { ContractDraftEditor } from "@/components/contracts/contract-draft-editor";
import { useDraftEditor } from "@/components/contracts/use-draft-editor";
import { MOCK_CONTRACT_DRAFT } from "@/lib/contracts/draft-editor";

/**
 * Contract draft-editor preview island.
 *
 * Seeds the editor with mocked terms so the UX can be reviewed end to end
 * without a backend. Persistence is intentionally absent at this stage.
 */
export function ContractDraftEditorIsland() {
  const editor = useDraftEditor(MOCK_CONTRACT_DRAFT);
  return <ContractDraftEditor editor={editor} />;
}
