// ESLint flat-config for the project.
//
// We layer two Next.js presets on top of each other:
//   1. `core-web-vitals` adds the standard React/Next rules plus a few
//      performance lints that surface common mistakes.
//   2. `typescript` adds TypeScript-aware rules (e.g. no unused vars,
//      consistent imports).
//
// Local overrides:
//   * `react-hooks/set-state-in-effect` is disabled because the polling
//     loops on the attendee dashboard and staff shop intentionally call
//     `setState` inside `useEffect` callbacks.
//
// Global ignores: build outputs, dependencies, and the auto-generated
// Next type-declaration file. `prisma/seed.js` is a CommonJS script that
// uses `require`/`process.exit` and would otherwise trip the rules; it
// is excluded explicitly.

import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "dist/**",
    "next-env.d.ts",
    "prisma/seed.js"
  ])
]);
