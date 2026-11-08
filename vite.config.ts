import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Dev-only playground for the registry components. Not part of what ships
// to consumers via `pnpm registry:build`.
export default defineConfig({
  root: "dev",
  plugins: [react(), tailwindcss()],
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
})
