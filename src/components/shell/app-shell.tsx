"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import type { City } from "@/lib/field-ops/types";

export function AppShell({
  children,
  cityOptions,
}: {
  children: ReactNode;
  cityOptions: City[];
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  return (
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="app-main min-w-0">
        <Topbar
          navOpen={navOpen}
          onOpenNav={() => setNavOpen(true)}
          cityOptions={cityOptions}
        />
        <main className="content w-full min-w-0 px-3 py-5 sm:px-4 md:px-6 lg:px-8">{children}</main>
      </div>
      <button
        type="button"
        className={`nav-scrim${navOpen ? " is-visible" : ""}`}
        aria-label="إغلاق القائمة الجانبية"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
    </div>
  );
}
