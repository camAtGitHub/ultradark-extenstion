import { defineConfig } from "vite";
import { copyFileSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    modulePreload: false,
    rollupOptions: {
      input: {
        content: "src/content/index.ts",
        background: "src/background/index.ts",   // Add background
        popup: "src/popup/index.html",
        options: "src/options/index.html"
      },
      output: {
        entryFileNames: "src/[name]/index.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";
          if (name.endsWith(".css")) return "assets/[name][extname]";
          if (name.includes("optimizer-worker")) return "assets/[name].js";
          return "assets/[name]-[hash][extname]";
        },
        inlineDynamicImports: true,
        format: 'iife'
      }
    }
  },
  plugins: [
    {
      name: "fix-manifest",
      writeBundle() {
        const manifestPath = resolve(__dirname, "dist/manifest.json");
        const originalManifest = JSON.parse(readFileSync("manifest.json", "utf-8"));

        // Ensure correct paths
        const fixedManifest = {
          ...originalManifest,
          background: {
            scripts: ["src/background/index.js"],
            persistent: true
          },
          content_scripts: [
            {
              matches: ["<all_urls>"],
              js: ["src/content/index.js"],
              run_at: "document_idle"
            }
          ],
          web_accessible_resources: [
            "assets/storage.js",
            "assets/regex.js",
            "assets/optimizer-worker-CdkjHAG0.js"
          ]
        };

        writeFileSync(manifestPath, JSON.stringify(fixedManifest, null, 2));
      }
    }
  ]
});
