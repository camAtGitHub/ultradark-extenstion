# Testing Guide for Document Readiness Fix

## Issue Summary
The extension was failing to apply dark themes correctly on initial page load, but worked fine when sliders were adjusted. The root cause was that `document.body` didn't exist when the content script ran very early in the page lifecycle, causing DOM-walker and Chroma-semantic algorithms to fail silently.

## What Was Fixed

### 1. Document Readiness Utility (`src/utils/document-ready.ts`)
- Created `waitForDocumentReady()` function that waits for document.body to be available
- Created `isDocumentBodyReady()` helper to check body availability
- Handles edge cases like early script execution before DOM is ready

### 2. Content Script Updates (`src/content/index.ts`)
- Added `await waitForDocumentReady()` before applying themes
- Added debug logging to track document state during theme application
- Logs show: body existence, readyState, and when waiting/ready occurs

### 3. Algorithm Safety Guards

#### DOM-Walker (`src/content/algorithms/dom-walker.ts`)
- Added safety check: if `document.body` doesn't exist, falls back to Photon Inverter
- Added safety check before attaching MutationObserver
- Added debug warnings when fallback occurs

#### Chroma-Semantic (`src/content/algorithms/chroma-semantic.ts`)
- Added safety check: if `document.body` doesn't exist, falls back to Photon Inverter
- Added safety check before attaching MutationObserver
- Added debug warnings when fallback occurs

## Expected Log Output (After Fix)

### On Initial Page Load (Success Case)
```
[UltraDark] Background script initialized
[UltraDark] content script started to load
[UltraDark] [Dark Detection] Starting dark theme detection for: https://www.theregister.com/
[UltraDark] [Dark Detection] Average luminance: 1 (threshold: 0.2)
[UltraDark] [Dark Detection] Result: LIGHT (no dark indicators found)
[UltraDark] [Document State] Waiting for document body to be ready...
[UltraDark] [Document State] Document body ready, proceeding with theme application
[UltraDark] Applying dark theme with mode: dom-walker
[UltraDark] Applying CSS with mode: dom-walker
[UltraDark] [Document State] body exists: true readyState: interactive
[UltraDark] [DOM Walker] Starting DOM traversal
[UltraDark] [DOM Walker] Starting Lazy Traversal
[UltraDark] [DOM Walker] Streamed batch: 500
[UltraDark] [DOM Walker] Streamed batch: 128
[UltraDark] [DOM Walker] DOM traversal complete
[UltraDark] [DOM Walker] MutationObserver attached to body  <-- THIS SHOULD ALWAYS APPEAR NOW
```

### On Slider Change (Should Still Work)
```
[UltraDark] Settings updated, reapplying theme
[UltraDark] [Document State] Waiting for document body to be ready...
[UltraDark] [Document State] Document body ready, proceeding with theme application
[UltraDark] Applying dark theme with mode: dom-walker
[UltraDark] Applying CSS with mode: dom-walker
[UltraDark] [Document State] body exists: true readyState: complete
[UltraDark] [DOM Walker] Starting DOM traversal
[UltraDark] [DOM Walker] Starting Lazy Traversal
[UltraDark] [DOM Walker] Streamed batch: 500
[UltraDark] [DOM Walker] Streamed batch: 128
[UltraDark] [DOM Walker] DOM traversal complete
[UltraDark] [DOM Walker] MutationObserver attached to body
```

### Fallback Case (Very Early Execution - Should Rarely Occur)
```
[UltraDark] [Document State] body exists: false readyState: loading
[UltraDark] [DOM Walker] ⚠️ document.body not available, falling back to Photon Inverter
[UltraDark] [Photon Inverter] Applying dark theme with new CSS inversion logic
[UltraDark] [Photon Inverter] CSS applied successfully
```

## How to Test

### Prerequisites
1. Enable development mode in extension settings
2. Open browser console on the page you're testing
3. Open extension background console (about:debugging -> Inspect)

### Test Steps

#### Test 1: Initial Page Load
1. **Clear browser cache** to ensure clean test
2. Navigate to a test site (e.g., https://www.theregister.com)
3. Check console logs:
   - ✅ Should see "Document body ready, proceeding with theme application"
   - ✅ Should see "MutationObserver attached to body"
   - ✅ Dark theme should be fully applied
   - ✅ Page should be properly darkened (not partially light)

#### Test 2: Navigate to Another Page on Same Site
1. Click a link on the test site
2. Check console logs:
   - ✅ Should see same logs as Test 1
   - ✅ Dark theme should apply correctly immediately
   - ✅ Should not require slider adjustment

#### Test 3: Slider Adjustment (Regression Test)
1. Load any site
2. Open extension popup
3. Adjust any slider (contrast, brightness, etc.)
4. Check console logs:
   - ✅ Should see "Settings updated, reapplying theme"
   - ✅ Should see "MutationObserver attached to body"
   - ✅ Theme should update immediately

#### Test 4: Different Algorithms
Test with each algorithm mode:
- Photon Inverter (should always work, no body dependency)
- DOM Walker (should now wait for body)
- Chroma-Semantic (should now wait for body)

For each:
1. Switch to that algorithm in options
2. Load a fresh page
3. ✅ Verify full dark theme applied on initial load
4. ✅ Verify "MutationObserver attached" log appears

#### Test 5: Fast Navigation
1. Load a site
2. Quickly click multiple links in succession
3. ✅ Each page should apply dark theme correctly
4. ✅ Console should show consistent log patterns

### Test Sites Recommended
- News sites: theregister.com, arstechnica.com
- Complex SPAs: gmail.com, github.com
- Simple sites: example.com
- Forums: reddit.com
- Documentation: developer.mozilla.org

## What to Look For (Debugging)

### ✅ Success Indicators
- "MutationObserver attached to body" appears on initial load
- Dark theme fully applied (no white/light areas)
- No need to adjust sliders to trigger theme application
- All three log statements appear: "Waiting" -> "ready" -> "MutationObserver attached"

### ❌ Failure Indicators (Would Indicate Bug)
- "MutationObserver attached" missing on initial load
- Page loads mostly light, requires slider adjustment to fix
- "document.body not available" appears frequently (should be rare)
- "Document body ready" appears but MutationObserver still not attached

### ⚠️ Expected Warnings (Normal)
- "document.body not available, falling back to Photon Inverter" - Should be rare, indicates very early execution
- Cross-origin stylesheet warnings - Normal, expected for some sites

## Build & Deploy

```bash
# Build the extension
npm run build

# Load in Firefox
# 1. Open about:debugging#/runtime/this-firefox
# 2. Click "Load Temporary Add-on"
# 3. Select dist/manifest.json

# View logs
# - Page console: Right-click page -> Inspect -> Console
# - Background console: about:debugging -> Inspect button on extension
```

## Automated Tests

```bash
# Run all tests (85 tests should pass)
npm test

# Tests specifically for document-ready utility
npm test -- tests/utils/document-ready.test.ts
```

All tests should pass. The test suite includes:
- 6 tests for document-ready utility
- 18 tests for algorithms
- 61 other tests for various functionality
