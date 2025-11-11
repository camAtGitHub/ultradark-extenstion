// scripts/build-bg.js
const { build } = require("esbuild");
const { mkdirSync } = require("fs");
const outdir = "dist/src/background";
mkdirSync(outdir, { recursive: true });

build({
  entryPoints: ["src/background/index.ts"],
  bundle: true,
  outfile: `${outdir}/index.js`,
  platform: "browser",
  format: "iife",        // browser-safe IIFE (no require)
  target: ["es2020"],
  sourcemap: false,
  minify: false
}).then(() => {
  console.log("✔ background built with esbuild -> dist/src/background/index.js");
}).catch((e) => {
  console.error(e);
  process.exit(1);
});

