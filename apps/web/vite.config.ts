import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const partnerJwt = env.NEAR_INTENTS_JWT;
  return {
    plugins: [
      react(),
      ...nodePolyfills({
        include: ["buffer", "crypto", "util", "stream", "process"],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    server: {
      proxy: {
        "/1click": {
          target: "https://1click.chaindefuser.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/1click/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              const path = proxyReq.path ?? "";
              const quoteRoute = /\/v0\/(quote|tokens|status)(\?|$)/.test(path);
              if (quoteRoute && partnerJwt && !proxyReq.getHeader("authorization")) {
                proxyReq.setHeader("Authorization", `Bearer ${partnerJwt}`);
              }
            });
          },
        },
      },
    },
  };
});
