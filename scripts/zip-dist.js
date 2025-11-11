// scripts/zip-dist.js
import { createWriteStream, existsSync, unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import archiver from "archiver";

const distDir = "dist";
const tempZip = "ultradark-reader-dist.zip";
const finalZip = path.join(distDir, "ultradark-reader-dist.zip");

if (!existsSync(distDir)) {
  console.error("✖ dist/ directory not found. Build or create dist/ before zipping.");
  process.exit(1);
}

console.log(`Creating ${finalZip} (temp: ${tempZip})...`);

const output = createWriteStream(tempZip);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`✔ Created zip (${archive.pointer()} bytes)`);
  try {
    // move the zip into dist/ after archive is finished so it's not included in itself
    renameSync(tempZip, finalZip);
    console.log(`✔ Moved zip to ${finalZip}`);
    process.exit(0);
  } catch (err) {
    console.error("✖ Failed to move zip into dist/:", err);
    if (existsSync(tempZip)) unlinkSync(tempZip);
    process.exit(1);
  }
});

output.on("error", (err) => {
  console.error("✖ Failed to write zip file:", err);
  if (existsSync(tempZip)) unlinkSync(tempZip);
  process.exit(1);
});

archive.on("warning", (err) => {
  // log warnings, but do not fail for ENOENT
  if (err.code === "ENOENT") {
    console.warn("zip warning:", err);
  } else {
    throw err;
  }
});

archive.on("error", (err) => {
  console.error("✖ Archive failed:", err);
  if (existsSync(tempZip)) unlinkSync(tempZip);
  process.exit(1);
});

// archive contents of dist/ at the root of the zip
archive.pipe(output);
archive.directory(`${distDir}/`, false); // false -> put contents at zip root
archive.finalize();
