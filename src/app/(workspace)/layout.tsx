import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell
      cityOptions={listCities().filter((city) =>
        session.accessibleCities.includes(city.id),
      )}
    >
      {children}
    </AppShell>
  );
}
