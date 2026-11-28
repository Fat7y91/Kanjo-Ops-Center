"use client";

import { useEffect, useState } from "react";

import {
  applyTheme,
  currentTheme,
  THEME_EVENT,
  type Theme,
} from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<Theme>).detail;
      setTheme(detail === "dark" ? "dark" : "light");
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? "الوضع النهاري" : "الوضع الليلي";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => applyTheme(next)}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.4v3M12 18.6v3M2.4 12h3M18.6 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.6 14.2A8.4 8.4 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8Z" />
        </svg>
      )}
      <span>{theme === "dark" ? "نهاري" : "ليلي"}</span>
    </button>
  );
}
