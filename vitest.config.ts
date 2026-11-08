import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@/components/ui",
        replacement: fileURLToPath(new URL("./dev/ui", import.meta.url)),
      },
      {
        find: "@/lib/utils",
        replacement: fileURLToPath(new URL("./dev/utils.ts", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(
          new URL("./registry/calendar-events", import.meta.url),
        ),
      },
    ],
  },
  test: { environment: "jsdom" },
});
