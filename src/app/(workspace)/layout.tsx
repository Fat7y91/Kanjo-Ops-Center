import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth/guard";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
