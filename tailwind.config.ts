import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#080808", // page background
          900: "#0f0f0f", // card background
          800: "#151515", // secondary surface (pills, inputs at rest)
          700: "#242424", // card / input borders
          600: "#2e2e2e", // hover / active borders
          500: "#454545",
        },
        ink: "#f5f5f5", // primary text — bg-ink/text-ink/border-ink all valid
        muted: "#9a9a9a",
        faint: "#6b6b6b",
        accent: {
          DEFAULT: "#00e676", // electric green — primary CTA / active states
          light: "#33ea8f",
          dark: "#00c765",
        },
        danger: "#ff5277",
        run: "#2ec4b6",
        fuel: "#ffb703",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
