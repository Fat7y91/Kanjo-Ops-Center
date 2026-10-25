"use client";

import { logoutAction } from "@/app/login/actions";
import { usePermission } from "@/components/auth/use-permission";
import { ThemeToggle } from "@/components/shell/theme-toggle";

type TopbarProps = {
  navOpen: boolean;
  onOpenNav: () => void;
};

export function Topbar({ navOpen, onOpenNav }: TopbarProps) {
  const { user, pending, revision } = usePermission();

  return (
    <header className="topbar px-3 sm:px-4 md:px-6 lg:px-8">
      <div className="topbar-context">
        <button
          type="button"
          className="nav-toggle lg:hidden"
          aria-label="فتح القائمة الجانبية"
          aria-controls="app-sidebar"
          aria-expanded={navOpen}
          onClick={onOpenNav}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className={`status-pill${pending ? " is-pending" : ""}`}>
          <span className="status-dot" />
          {pending ? "جارٍ مزامنة الصلاحيات" : "الصلاحيات محدّثة"}
        </span>
        <span className="revision-pill">إصدار {revision}</span>
      </div>

      <div className="topbar-user">
        <ThemeToggle />
        {user && (
          <div className="user-copy">
            <strong>{user.name}</strong>
            <span>{user.title}</span>
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" className="button button-quiet button-small">
            تسجيل الخروج
          </button>
        </form>
      </div>
    </header>
  );
}
