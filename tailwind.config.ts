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
          950: "#000000",
          900: "#0a0a0a",
          800: "#131313",
          700: "#1c1c1c",
          600: "#2a2a2a",
          500: "#3d3d3d",
        },
        accent: {
          DEFAULT: "#ff5b2e",
          light: "#ff7b52",
          dark: "#d8461f",
        },
        run: "#2ec4b6",
        fuel: "#ffb703",
      },
      fontFamily: {
        sans: [
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
