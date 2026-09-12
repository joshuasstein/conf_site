import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Session-type palette classes (see lib/api.ts SESSION_COLOR_CLASSES) are chosen
  // dynamically at runtime, so safelist them to survive purging.
  safelist: [
    ...["indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "slate"].flatMap((c) => [
      `bg-${c}-50`, `bg-${c}-100`, `bg-${c}-200`, `bg-${c}-500`,
      `border-${c}-200`, `border-${c}-300`,
      `text-${c}-600`, `text-${c}-700`,
    ]),
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [forms],
};

export default config;
