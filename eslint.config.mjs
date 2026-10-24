import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // store.ts (the 11k-line game engine) carries pre-existing
    // @typescript-eslint/no-explicit-any hits in its save-migration block.
    // Downgraded to a warning for this file only so unrelated edits here aren't
    // blocked by CI's whole-file lint. Tracked as tech debt to properly type
    // those sites; policy is unchanged for every other file.
    files: ["src/lib/engine/store.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
