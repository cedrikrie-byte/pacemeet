/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        run: v("run"),
        ride: v("ride"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
      },
      fontFamily: {
        display: ['"Archivo"', "system-ui", "sans-serif"],
        sans: ['"Figtree"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { xl2: "1.125rem" },
      opacity: { 12: "0.12", 15: "0.15", 85: "0.85" },
    },
  },
  plugins: [],
};
