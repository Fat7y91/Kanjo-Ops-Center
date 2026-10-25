import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/providers/session-provider";
import { getServerSession } from "@/lib/auth/server-session";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "كانجو | Kanjo Enterprise V2",
  description:
    "منصة العمليات المؤسسية القائمة على الصلاحيات الديناميكية، بدون أدوار ثابتة.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <SessionProvider initialSession={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
