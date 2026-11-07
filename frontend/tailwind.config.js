/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), ink: v("ink"), muted: v("muted"),
        line: v("line"), brand: v("brand"), brandink: v("brand-ink"), accent: v("accent"), accentink: v("accent-ink"),
        strong: v("strong"), okay: v("okay"), weak: v("weak"), info: v("info"),
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Plus Jakarta Sans"', '"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgb(15 23 42 / .06), 0 4px 16px -4px rgb(15 23 42 / .08)" },
      borderRadius: { xl2: "1.125rem" },
    },
  },
  plugins: [],
};
