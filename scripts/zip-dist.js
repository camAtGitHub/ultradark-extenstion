// scripts/zip-dist.js
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
const out = createWriteStream("ultradark-reader-dist.zip");
const zip = spawn(process.platform === "win32" ? "powershell" : "zip", process.platform === "win32"
  ? ["-NoProfile", "-Command", "Compress-Archive -Path dist/* -DestinationPath ultradark-reader-dist.zip -Force"]
  : ["-r", "-", "dist"]);

if (process.platform !== "win32") zip.stdout.pipe(out);
zip.on("close", (code) => {
  if (process.platform !== "win32") console.log(code === 0 ? "✔ Zipped dist" : "✖ Zip failed");
  else console.log("✔ Zipped dist (PowerShell)");
});