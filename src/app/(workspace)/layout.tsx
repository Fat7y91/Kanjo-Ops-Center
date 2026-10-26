import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth/guard";
import { scopedCities } from "@/lib/city-scope-query";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell
      cityOptions={scopedCities(session)}
    >
      {children}
    </AppShell>
  );
}
