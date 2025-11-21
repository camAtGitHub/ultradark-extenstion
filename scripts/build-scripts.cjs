/*
 scripts/build-scripts.cjs
 Builds background and content scripts with esbuild into browser-friendly IIFEs.
*/
const { build } = require('esbuild');
const { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } = require('fs');
const path = require('path');

async function buildAll() {
  // Ensure output directories exist
  mkdirSync('dist/src/background', { recursive: true });
  mkdirSync('dist/src/content', { recursive: true });
  mkdirSync('dist/assets', { recursive: true });

  try {
    // Build background script
    await build({
      entryPoints: ['src/background/index.ts'],
      bundle: true,
      outfile: 'dist/src/background/index.js',
      platform: 'browser',
      format: 'iife',
      target: ['es2020'],
      sourcemap: false,
      minify: false
    });
    console.log('✔ background built with esbuild -> dist/src/background/index.js');

    // Build optimizer worker
    await build({
      entryPoints: ['src/content/optimizer-worker.ts'],
      bundle: true,
      outfile: 'dist/assets/optimizer-worker.js',
      platform: 'browser',
      format: 'iife',
      target: ['es2020'],
      sourcemap: false,
      minify: false
    });
    console.log('✔ optimizer worker built with esbuild -> dist/assets/optimizer-worker.js');

    // Read content script source and replace worker import
    let contentSource = readFileSync('src/content/index.ts', 'utf-8');
    
    // Replace the worker import with a direct path
    contentSource = contentSource.replace(
      /import\s+WorkerUrl\s+from\s+["']\.\/optimizer-worker\?worker&url["'];?/,
      'const WorkerUrl = browser.runtime.getURL("assets/optimizer-worker.js");'
    );
    
    // Write temp file in src/content directory so imports resolve correctly
    const tempContentPath = 'src/content/.temp-index.ts';
    writeFileSync(tempContentPath, contentSource);

    // Build content script
    await build({
      entryPoints: [tempContentPath],
      bundle: true,
      outfile: 'dist/src/content/index.js',
      platform: 'browser',
      format: 'iife',
      target: ['es2020'],
      sourcemap: false,
      minify: false
    });
    console.log('✔ content script built with esbuild -> dist/src/content/index.js');

    // Clean up temp file
    const fs = require('fs');
    if (fs.existsSync(tempContentPath)) {
      fs.unlinkSync(tempContentPath);
    }

    // Update manifest to include all web_accessible_resources
    updateManifestWebAccessibleResources();

  } catch (e) {
    console.error('Build error:', e);
    process.exit(1);
  }
}

function updateManifestWebAccessibleResources() {
  const manifestPath = 'dist/manifest.json';
  if (!existsSync(manifestPath)) {
    console.warn('⚠ manifest.json not found in dist, skipping web_accessible_resources update');
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const assetsDir = 'dist/assets';
  const webAccessibleResources = [];

  if (existsSync(assetsDir)) {
    readdirSync(assetsDir).forEach(file => {
      if (file.endsWith('.js')) {
        webAccessibleResources.push(`assets/${file}`);
      }
    });
  }

  manifest.web_accessible_resources = webAccessibleResources;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✔ manifest.json updated with web_accessible_resources:', webAccessibleResources);
}

buildAll();
