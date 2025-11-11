import { defineConfig } from "vite";
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    modulePreload: false,
    rollupOptions: {
      input: {
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
        }
      }
    }
  },
  plugins: [
    {
      name: "copy-assets",
      writeBundle() {
        const manifestPath = resolve(__dirname, "dist/manifest.json");
        const originalManifest = JSON.parse(readFileSync("manifest.json", "utf-8"));

        // Copy icons
        const iconsDir = resolve(__dirname, "dist/src/assets/icons");
        if (!existsSync(iconsDir)) {
          mkdirSync(iconsDir, { recursive: true });
        }
        
        // Copy icon files from src
        const srcIconsDir = resolve(__dirname, "src/assets/icons");
        if (existsSync(srcIconsDir)) {
          readdirSync(srcIconsDir).forEach(file => {
            if (file.endsWith('.png')) {
              copyFileSync(
                resolve(srcIconsDir, file),
                resolve(iconsDir, file)
              );
            }
          });
        }

        // Dynamically list web_accessible_resources from dist/assets
        // Include both Vite-built assets and esbuild-built worker
        const assetsDir = resolve(__dirname, "dist/assets");
        const webAccessibleResources: string[] = [];
        if (existsSync(assetsDir)) {
          readdirSync(assetsDir).forEach(file => {
            if (file.endsWith('.js')) {
              webAccessibleResources.push(`assets/${file}`);
            }
          });
        }

        // Update manifest with dynamic resources
        const updatedManifest = {
          ...originalManifest,
          web_accessible_resources: webAccessibleResources
        };

        // Write manifest with correct paths
        writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
      }
    }
  ]
});
