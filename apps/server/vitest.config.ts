import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@kabu/game-core": fileURLToPath(
        new URL("../../packages/game-core/src/index.ts", import.meta.url),
      ),
      "@kabu/protocol": fileURLToPath(
        new URL("../../packages/protocol/src/index.ts", import.meta.url),
      ),
    },
  },
});
