const { heroui } = require("@heroui/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/web/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  darkMode: 'class',
  plugins: [
    heroui({
      themes: {
        dark: {
          colors: {
            background: "#0f1923",
            foreground: "#e2e8f0",
            content1: "#182636",
            content2: "#1e3044",
            content3: "#243a52",
            content4: "#2a4460",
            default: {
              50: "#0f1923",
              100: "#182636",
              200: "#1e3044",
              300: "#243a52",
              400: "#4a6a8a",
              500: "#6b8bb0",
              600: "#8facc8",
              700: "#b3cde0",
              800: "#d7e4ef",
              900: "#edf2f7",
              DEFAULT: "#1e3044",
              foreground: "#e2e8f0",
            },
            primary: {
              50: "#0c1d2e",
              100: "#132d47",
              200: "#1a3d60",
              300: "#2563eb",
              400: "#3b82f6",
              500: "#3b82f6",
              600: "#60a5fa",
              700: "#93c5fd",
              800: "#bfdbfe",
              900: "#dbeafe",
              DEFAULT: "#3b82f6",
              foreground: "#ffffff",
            },
            divider: "#1e3044",
            focus: "#3b82f6",
          },
        },
        light: {
          colors: {
            background: "#ffffff",
            foreground: "#1a202c",
            content1: "#f7fafc",
            content2: "#edf2f7",
            content3: "#e2e8f0",
            content4: "#cbd5e0",
            primary: {
              DEFAULT: "#2563eb",
              foreground: "#ffffff",
            },
          },
        },
      },
    }),
  ],
};
