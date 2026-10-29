import type { Config } from "tailwindcss";

/**
 * Kanjo V2 Tailwind theme.
 *
 * The `kanjo` colour scale mirrors `src/styles/tokens.css`. Components reference
 * semantic names (`kanjo-interactive`, `kanjo-surface`, …) instead of raw hex so
 * the brand contract lives in exactly one place.
 */
const config: Config = {
  // The app toggles `data-theme` on <html>, not the OS-level prefers-color-scheme.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  important: true,
  theme: {
    extend: {
      colors: {
        kanjo: {
          base: "var(--kanjo-purple-base)",
          interactive: "var(--kanjo-purple-interactive)",
          hover: "var(--kanjo-interactive-hover)",
          active: "var(--kanjo-interactive-active)",
          gold: "var(--kanjo-gold)",
          surface: "var(--kanjo-surface)",
          canvas: "var(--kanjo-canvas)",
          pastel: "var(--kanjo-pastel)",
          "pastel-ink": "var(--kanjo-pastel-ink)",
          line: "var(--line)",
          "line-strong": "var(--line-strong)",
          ink: "var(--ink)",
          "ink-soft": "var(--ink-soft)",
        },
        brand: {
          DEFAULT: "var(--kanjo-purple-base)",
          soft: "var(--nav-soft)",
          gold: "var(--kanjo-gold)",
        },
        surface: {
          light: "var(--kanjo-surface)",
          muted: "var(--surface-soft)",
          dark: "var(--kanjo-surface)",
          deep: "var(--kanjo-purple-base)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        modal: "var(--radius-modal)",
        input: "var(--radius-input)",
      },
      boxShadow: {
        card: "var(--shadow)",
        raised: "var(--shadow-md)",
        modal: "var(--shadow-modal)",
        kanjo: "var(--shadow)",
        "kanjo-lg": "var(--shadow-lg)",
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "Cairo", "system-ui", "sans-serif"],
      },
      ringColor: {
        kanjo: "var(--kanjo-focus-ring)",
        "kanjo-strong": "var(--kanjo-focus-ring-strong)",
      },
    },
  },
  plugins: [],
};

export default config;
