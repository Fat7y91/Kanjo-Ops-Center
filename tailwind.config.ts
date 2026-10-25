import type { Config } from "tailwindcss";

const config: Config = {
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
        brand: {
          DEFAULT: "#230535",
          soft: "#35104f",
          gold: "#ffd700",
        },
        surface: {
          light: "#ffffff",
          muted: "#f4f4f5",
          dark: "#18181b",
          deep: "#09090b",
        },
      },
      boxShadow: {
        card: "0 12px 32px rgba(24, 24, 27, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
