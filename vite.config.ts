import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The built site may load nothing but its own files and may not talk to anything. The policy is
// added at build time only: the development server injects an inline script for hot reload,
// which this policy would rightly block.
const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const contentSecurityPolicy = (): Plugin => ({
  name: "brownout-content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: POLICY },
      injectTo: "head-prepend",
    },
  ],
});

// The game is a static site with no server. A relative base lets it be served from any folder,
// including a project page on free static hosting.
export default defineConfig({
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  build: { outDir: "dist", sourcemap: false },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
