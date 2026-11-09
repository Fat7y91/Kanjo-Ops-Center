import { ContractDraftEditorIsland } from "@/components/contracts/contract-draft-editor-island";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Contract draft-editor review screen.
 *
 * UI-first preview of the pre-generation editor seeded with mocked terms, so the
 * product owner can review the editing experience before the persistence layer
 * is built. It inherits the `/contracts` module guard.
 */
export default async function ContractDraftEditorPage() {
  await requireModuleAccess("/contracts");
  return (
    <>
      <PageHeader
        eyebrow="سجل العقود"
        title="محرر مسودة العقد"
        description="عدّل البنود والعمولات قبل توليد ملف PDF النهائي، ثم احفظ المسودة."
      />
      <ContractDraftEditorIsland />
    </>
  );
}
