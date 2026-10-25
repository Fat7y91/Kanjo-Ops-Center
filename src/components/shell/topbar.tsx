"use client";

import { logoutAction } from "@/app/login/actions";
import { usePermission } from "@/components/auth/use-permission";

export function Topbar() {
  const { user, pending, revision } = usePermission();

  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className={`status-pill${pending ? " is-pending" : ""}`}>
          <span className="status-dot" />
          {pending ? "Syncing capabilities" : "Capabilities live"}
        </span>
        <span className="revision-pill">rev {revision}</span>
      </div>

      <div className="topbar-user">
        {user && (
          <div className="user-copy">
            <strong>{user.name}</strong>
            <span>{user.title}</span>
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" className="button button-quiet button-small">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
