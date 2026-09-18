import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The backend is a separate Express process (docs/14_developer_setup.md §8)
// with its own CORS allow-list, so the frontend talks to it over HTTP rather
// than proxying -- one less indirection to explain during a walkthrough.
//
// allowedHosts exists because of the tunnel: Vite's dev server refuses any
// request whose Host header it doesn't recognise ("Blocked request. This host
// is not allowed."), and a tunnel forwards the *public* hostname. Without
// this, the app works locally and returns that error the moment it is shared.
// Quick tunnels always end in .trycloudflare.com; a custom domain is added
// through VITE_ALLOWED_HOSTS, e.g. VITE_ALLOWED_HOSTS=".example.com".
export default defineConfig(({ mode }) => {
  // loadEnv rather than process.env: the frontend has no Node type
  // dependency, and this is Vite's own supported way to read config-time env.
  const env = loadEnv(mode, ".", "");
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? ".trycloudflare.com")
    .split(",")
    .map((host: string) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts,
      // A quick tunnel (`cloudflared tunnel --url http://localhost:5173`)
      // serves exactly ONE origin, so the browser on the public URL cannot
      // reach the backend directly -- and `http://localhost:3001` from a
      // remote viewer means *the viewer's* machine, not this laptop. Proxying
      // /api through this dev server lets one public link serve both halves,
      // same-origin, which also takes CORS out of the picture for tunnel use.
      // (A named tunnel can route /api/* by path instead, docs/25 §5.)
      proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } },
    },
  };
});
