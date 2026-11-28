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
          deep: "var(--kanjo-purple-deep)",
          soft: "var(--kanjo-purple-soft)",
          interactive: "var(--kanjo-purple-interactive)",
          hover: "var(--kanjo-interactive-hover)",
          active: "var(--kanjo-interactive-active)",
          gold: "var(--kanjo-gold)",
          "gold-warm": "var(--kanjo-gold-warm)",
          "gold-light": "var(--kanjo-gold-light)",
          orange: "var(--kanjo-orange)",
          cream: "var(--kanjo-cream)",
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
          deep: "var(--kanjo-purple-deep)",
          soft: "var(--kanjo-purple-soft)",
          gold: "var(--kanjo-gold)",
          "gold-light": "var(--kanjo-gold-light)",
          cream: "var(--kanjo-cream)",
          ink: "var(--kanjo-ink-deep)",
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
        gold: "var(--shadow-gold)",
        glow: "var(--shadow-glow)",
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
