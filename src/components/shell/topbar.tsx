"use client";

import { logoutAction } from "@/app/login/actions";
import { useEffect, useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import type { City } from "@/lib/field-ops/types";
import { readActiveCityId } from "@/lib/city-scope";

type TopbarProps = {
  navOpen: boolean;
  onOpenNav: () => void;
  cityOptions: City[];
};

export function Topbar({ navOpen, onOpenNav, cityOptions }: TopbarProps) {
  const {
    user,
    pending,
    revision,
    permissions,
    accessibleCities,
    globalScope,
  } = usePermission();
  const cityScopeKey = globalScope
    ? cityOptions.map((city) => city.id).join("|")
    : accessibleCities.join("|");
  const canSwitchCities =
    permissions.has("view_cities") && cityOptions.length > 1;

  function selectCity(cityId: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("kanjo_active_city", cityId);
    window.dispatchEvent(new Event("kanjo-city-change"));
  }

  const scopedOptions = globalScope
    ? cityOptions
    : cityOptions.filter((city) => accessibleCities.includes(city.id));
  const [activeCityId, setActiveCityId] = useState<string | null>(null);
  const scopeKey = cityScopeKey;
  const optionsKey = scopedOptions.map((city) => city.id).join("|");

  useEffect(() => {
    const sync = () => {
      setActiveCityId(
        readActiveCityId(scopedOptions.map((city) => city.id)),
      );
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kanjo-city-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kanjo-city-change", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, optionsKey]);

  const activeCity =
    scopedOptions.find((city) => city.id === activeCityId) ??
    scopedOptions[0];

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
        {canSwitchCities ? (
          <label className="city-switcher">
            <span>نطاق المدينة</span>
            <select
              value={activeCity?.id ?? ""}
              onChange={(event) => selectCity(event.target.value)}
            >
              {scopedOptions.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
