import { localTestEnvironment } from "./tests/local-environment";
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: localTestEnvironment(),
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
