// @lovable.dev/vite-tanstack-config supplies the TanStack Start, React,
// Tailwind, path-alias and Nitro plugins used by this project.
// Lovable previews keep their own target; Vercel builds must emit Vercel Output v3.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercel = process.env["VERCEL"] === "1" || process.env["VERCEL"] === "true";

export default defineConfig({
  tanstackStart: {
    // Keep the SSR error wrapper as TanStack Start's server entry.
    server: { entry: "server" },
  },
  ...(isVercel
    ? {
        nitro: {
          preset: "vercel",
          output: {
            dir: ".vercel/output",
            serverDir: ".vercel/output/functions/__server.func",
            publicDir: ".vercel/output/static",
          },
        },
      }
    : {}),
});
