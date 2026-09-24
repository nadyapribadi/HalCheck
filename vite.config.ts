import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static-hosting friendly, deliberately:
// - `base: "./"` makes every built asset reference relative, so the same dist/
//   works from a local preview, from a GitHub Pages project path
//   (/HalCheck/), or from any subdirectory -- this app has no client router,
//   so nothing else is needed to serve it from a plain file host.
// - Two entry points, one build: the screening app, and the proof-bundle
//   verifier that anyone can use without an account. The verifier shares the
//   exact module the CLI uses (src/proof/verifyProofBundle.ts).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        verify: "verify/index.html",
      },
    },
  },
});
