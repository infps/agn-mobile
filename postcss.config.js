// Tailwind v3 exposes its PostCSS plugin as `tailwindcss`. This file used to
// name `@tailwindcss/postcss`, which is v4's package and is not installed —
// enough to fail the web bundle outright while native builds, which never run
// PostCSS, carried on looking fine.
export default {
  plugins: {
    tailwindcss: {},
  },
};
