import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api and /ws to lucifer-engine (localhost:4666 by default).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const engine = env.LUCIFER_ENGINE_URL ?? "http://localhost:4666";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": engine,
        "/ws": { target: engine.replace(/^http/, "ws"), ws: true },
      },
    },
  };
});
