import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/providers/session-provider";
import { getServerSession } from "@/lib/auth/server-session";

import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kanjo Enterprise V2",
  description:
    "Capability-based operations platform with dynamic, zero-role RBAC.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  return (
    <html lang="en">
      <body>
        <SessionProvider initialSession={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
