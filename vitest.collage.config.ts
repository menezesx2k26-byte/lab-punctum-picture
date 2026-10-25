import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/collage-frontend.spec.tsx"],
    environment: "node",
  },
});
