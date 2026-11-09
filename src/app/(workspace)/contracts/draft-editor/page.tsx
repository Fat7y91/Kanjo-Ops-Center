import { redirect } from "next/navigation";

import { ContractDraftEditorIsland } from "@/components/contracts/contract-draft-editor-island";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type PageProps = {
  searchParams: Promise<{ contract?: string }>;
};

/**
 * Contract draft-editor screen.
 *
 * Resolves the `?contract=` id and delegates to the island, which loads the
 * stored terms and mounts the editor. The page inherits the `/contracts` module
 * guard; per-contract edit rights (including force-edit) are enforced by the
 * terms endpoint.
 */
export default async function ContractDraftEditorPage({ searchParams }: PageProps) {
  await requireModuleAccess("/contracts");
  const { contract } = await searchParams;
  if (!contract) redirect("/contracts");

  return (
    <>
      <PageHeader
        eyebrow="سجل العقود"
        title="محرر مسودة العقد"
        description="حرّر البنود والعمولات والأقسام قبل توليد ملف PDF النهائي، ثم احفظ المسودة."
      />
      <ContractDraftEditorIsland contractId={contract} />
    </>
  );
}
