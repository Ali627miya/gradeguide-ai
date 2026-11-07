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
        sans: ['"Nunito Sans"', "Aptos", "system-ui", "Segoe UI", "sans-serif"],
        display: ['"Nunito"', '"Nunito Sans"', "Aptos", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 5px 20px rgb(55 48 100 / .055), 0 1px 3px rgb(55 48 100 / .04)" },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
