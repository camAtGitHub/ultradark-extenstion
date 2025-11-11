// scripts/write-icons.js
// Generates minimal placeholder PNG icons so the extension loads without external assets.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const ensureDir = (p) => mkdirSync(dirname(p), { recursive: true });

// A tiny 1x1 transparent PNG as base64 (valid placeholder for all sizes).
const b64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

const files = [
  "src/assets/icons/icon48.png",
  "src/assets/icons/icon96.png",
  "src/assets/icons/icon128.png"
];

for (const f of files) {
  ensureDir(f);
  writeFileSync(f, Buffer.from(b64, "base64"));
}
console.log("✔ Wrote placeholder icons.");