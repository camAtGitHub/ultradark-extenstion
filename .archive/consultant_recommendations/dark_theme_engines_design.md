# SOFTWARE DESIGN SPECIFICATION: "LUMINA-SHIFT" FIREFOX EXTENSION

## 1. SYSTEM ARCHITECTURE OVERVIEW

The extension utilizes the WebExtension API standard. It operates via a decoupled architecture to ensure main-thread responsiveness.

*   **Manifest V2 (Firefox Compatible):** Ensures strictly typed permissions and service worker persistence.
*   **Background Service Worker:** Handles state management, settings storage (local/sync), and tab event listeners.
*   **Content Script (Injector):** The execution environment for the rendering algorithms. It allows direct DOM access and CSSOM manipulation.
*   **Popup UI / Settings Panel:** User interface for mode selection and modifier adjustments.

---

## 2. THEME DETECTION MODULE (PRE-FLIGHT CHECK)

Before any dark mode algorithm is engaged, the detection module analyzes the page to prevent "double-darking" (inverting a page that is already dark, ruining readability).

### Logic Flow
1.  **Metadata Check:**
    *   Query `window.matchMedia('(prefers-color-scheme: dark)').matches`.
    *   Inspect `<meta name="color-scheme">` and CSS `color-scheme` property on `:root`.
2.  **Computed Style Sampling (The "Truth" Test):**
    *   Even if metadata claims "light", some sites ignore standards.
    *   **Sampling:** Select `body` and 5 random deeply nested `div` elements.
    *   **Luminosity Calculation:** Extract `background-color`. Calculate Relative Luminance (L) using the sRGB formula: $L = 0.2126R + 0.7152G + 0.0722B$.
    *   **Threshold:** If average Background Luminance < 0.2 (on a scale of 0-1), the page is inherently dark.
3.  **Heuristic Decision:**
    *   **Result:** `SKIP_INJECTION` if native dark mode is detected.
    *   **Override:** Provide a User Override flag in settings (`force_enable`) to bypass this check if the native theme is low contrast.

---



# Task 3 - Refactor Photon Inverter (Algorithm 1) to Use Bookmarklet Logic
##  ALGORITHM 1: THE "PHOTON INVERTER" (High Performance / CSS Filters)

**Priority:** MEDIUM

**Goal / Why:**
To replace the existing Photon Inverter implementation (which relied on `hue-rotate` and separate `brightness`/`contrast` modifiers) with a more robust and simplified CSS filter approach derived from the provided bookmarklet code. This new implementation effectively resolves the "OLED smearing" issue by using an off-white background (`#fefefe`) and streamlines media reversal by specifically excluding SVG images.

Bookmarklet code: `javascript:(d=>{var css=`:root{background-color:#fefefe;filter:invert(100%)}*{background-color:inherit}img:not([src*=".svg"]),video{filter:%20invert(100%)}`,style,id="dark-theme-snippet",ee=d.getElementById(id);if(null!=ee)ee.parentNode.removeChild(ee);else%20{style%20=%20d.createElement('style');style.type="text/css";style.id=id;if(style.styleSheet)style.styleSheet.cssText=css;else%20style.appendChild(d.createTextNode(css));(d.head||d.querySelector('head')).appendChild(style)}})(document)`

**Expected Outcome / Acceptance Criteria:**

*   Algorithm 1 (Photon Inverter) must inject its CSS inside a single `<style>` tag bearing the ID `dark-theme-snippet`.
*   The injected CSS must apply the inversion and background settings to the document root: `:root{background-color:#fefefe;filter:invert(100%)}`.
*   A rule must be applied to ensure all elements inherit the new background color: `*{background-color:inherit}`.
*   Media reversal must target images and video, explicitly excluding SVGs: `img:not([src*=".svg"]),video{filter:invert(100%)}`.
*   The previous implementation details, including the `hue-rotate(180deg)` rule and any separate settings for user-adjustable `brightness` or `contrast` CSS filters, must be removed from this algorithm's core code.
*   The logic must include the ability to fully remove the style tag (`dark-theme-snippet`) when the algorithm is toggled off.


---

## 4. ALGORITHM 2: THE "DOM WALKER" (Intermediate / Style Parsing)
**Strategy:** Recursive DOM Traversal & Computed Style Replacement.
**Complexity:** O(n) where n is DOM nodes.
**Use Case:** Standard websites, blogs, documentation where readability is key but structural complexity is moderate.

### Implementation Spec
1.  **Traversal Mechanism:**
    *   Use `document.createTreeWalker` (faster than `querySelectorAll`) to iterate over text nodes and element nodes.
    *   **Batching:** Process nodes in chunks (e.g., 500 nodes) using `requestAnimationFrame` to prevent UI blocking.
2.  **Color Logic (HSL Modification):**
    *   Extract Computed Style `color` and `background-color`.
    *   Convert RGB to HSL (Hue, Saturation, Lightness).
    *   **Logic - Backgrounds:**
        *   If $L > 50\%$, set $L_{new} = 100\% - L$. (Light becomes Dark).
        *   Maintain Hue and Saturation (preserves slight tints).
    *   **Logic - Text/Foreground:**
        *   If $L < 50\%$, set $L_{new} = 100\% - L$. (Dark becomes Light).
3.  **Edge Case Handling:**
    *   **Transparency:** If background is transparent (`rgba(0,0,0,0)`), look up the DOM tree to find the nearest opaque parent to determine contrast needs.
    *   **Borders:** Iterate through `border-color` properties and invert Lightness similarly to text.
4.  **Observer:**
    *   Attach a `MutationObserver` to the `body`. When new nodes are added (infinite scroll), add them to the processing queue.

---

## 5. ALGORITHM 3: THE "CHROMA-SEMANTIC ENGINE" (Opus Magnum / Advanced)
**Strategy:** Semantic Analysis, Intelligent Color Space Mapping (LCH), and Bitwise Optimization.
**Complexity:** O(n) optimized + Caching + GPU acceleration hints.
**Use Case:** Complex SPAs (React/Vue/Angular), data visualization tools, daily-driver usage.

### Core Concepts & Implementation
1.  **Variable Indexing (The "Root" Canal):**
    *   Scan `document.styleSheets` for CSS Custom Properties (`--variable-name`).
    *   Modify the *variables* directly rather than individual elements where possible. This utilizes the browser's native cascading engine for performance.

2.  **Semantic Classification:**
    *   Don't just look at colors; look at *roles*.
    *   Check WAI-ARIA roles (`role="button"`, `role="banner"`).
    *   **The Algorithm:**
        *   **Backgrounds:** Map to a curated "Dark Gray Palette" (e.g., `#121212` through `#2C2C2C`) based on DOM depth. Shallow depth (body) = Darkest. Deep depth (cards/modals) = Lighter. This creates visual elevation (Material Design principles).
        *   **Text:** Detect "Body Text" vs "Headings" vs "Links".
            *   Body Text: Off-white (`#E0E0E0`) to reduce eye strain (avoid pure white).
            *   Links: Desaturate the blue by 20% to reduce vibration against dark backgrounds.

3.  **Color Theory Engine (LCH/LAB Space):**
    *   Convert RGB to **CIELAB** or **LCH** (Lightness, Chroma, Hue).
    *   **Why?** RGB/HSL is perceptually non-uniform. Yellow at 50% lightness looks brighter than Blue at 50%. LCH solves this.
    *   **Processing:** Ensure the Perceptual Lightness contrast ratio between background and foreground meets WCAG AA (4.5:1). If the inversion fails this check, mathematically force the text lighter until ratio is met.

4.  **Bitwise Optimization (The Speed Layer):**
    *   For raw RGB manipulation (processing canvas data or inline styles):
    *   Use Bitwise Left/Right shifts to extract RGB channels from Integer representations instead of String parsing.
    *   *Example Logic:*
        ```text
        R = (colorInt >> 16) & 0xFF;
        G = (colorInt >> 8) & 0xFF;
        B = colorInt & 0xFF;
        // Apply transformation matrix
        // Reassemble using bitwise OR
        ```

5.  **Smart Exclusion (Computer Vision Lite):**
    *   Analyze `background-image` URLs. If small/icon, invert. If large (photo), preserve.
    *   Analyze Gradient vs Solid Color. Re-calculate Gradient stops to reverse direction and luminosity.

---

## 6. USER CONTROLS & MODIFIERS

The user interface allows fine-tuning of the active algorithm (specifically Algo 3).

### Input Parameters (0.0 to 1.0 scale)
1.  **Darkness Threshold:** Clamps the darkest possible black (e.g., User prefers `#1a1a1a` over `#000000`).
2.  **Contrast Boost:** Multiplies the separation between `fg` and `bg` luminance.
3.  **Sepia / Blue Light Filter:**
    *   Overlays a calculated warm tint (RGB: 255, 240, 200) blended via `multiply` mode.
    *   Converts cool gray backgrounds to warm charcoal.
4.  **Image Dimming:** Opacity mask on images to reduce glare.

### Debounce Mechanism
*   **Context:** Users sliding a range slider triggers hundreds of update events.
*   **Implementation:**
    *   **Input Event:** Listens to slider changes.
    *   **Logic:** `let timeout; clearTimeout(timeout); timeout = setTimeout(applyTheme, 150);`
    *   **Visual Feedback:** Apply a temporary CSS filter (cheap) instantly while the user slides, then execute the heavy algorithmic re-calculation (expensive) 150ms after the user stops sliding.
    *   **Storage:** Save preferences per-domain in `localStorage` only after 1000ms of inactivity.

---

## 7. PERFORMANCE & COMPATIBILITY SAFEGUARDS

*   **Virtual DOM Compatibility:**
    *   The extension relies on `MutationObserver` specifically watching `childList` and `attributes` (style, class).
    *   Uses a `Set` data structure to track processed Element IDs to verify nodes aren't processed twice in the same cycle.
*   **Canvas Protection:**
    *   Algo 3 detects `<canvas>`. Since we cannot easily invert drawn pixels without tainting the canvas, we apply a specific CSS filter `invert(1) hue-rotate(180deg)` ONLY to the canvas container if the canvas is detected to be used for text/data (heuristic check of canvas context), otherwise leave native.
*   **Fallback:**
    *   If Algo 3 execution time exceeds 200ms (detected via `performance.now()`), the system automatically degrades to Algo 1 (CSS Filters) and notifies the user via a non-intrusive toast: "Complex page detected: Switched to High-Performance Mode."
