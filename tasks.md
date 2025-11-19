Of course. As a Senior Software Project Analyst, I have analyzed the sprint requirements and broken them down into a series of structured, actionable tasks. Here is the complete breakdown for the engineering team.

***

# Task 1 - Core Refactor: Remove Legacy Theme Engines

**Priority:** CRITICAL

**Goal / Why:**
To prepare the codebase for the new, consultant-designed theme algorithms, the three existing legacy engines must be completely removed. This technical debt removal is a prerequisite for all other work in this sprint and prevents conflicts or dead code from remaining in the extension.

**Expected Outcome / Acceptance Criteria:**

* All source files, function calls, and UI elements related to the old three algorithms are deleted from the repository.
* The application compiles and runs without errors after removal, with the theme application logic effectively stubbed out or disabled.
* A clean interface or entry point is defined where the new theme engines will be integrated.
* The per-site configuration storage logic is updated to remove any references to the old engine identifiers.

**Status:** DONE

***

# Task 2 - Implement New Theme Detection Module (Pre-flight Check)

**Priority:** HIGH

**Goal / Why:**
To prevent applying a dark theme to websites that are already dark ("double-darking"), a new, more robust pre-flight check is required. This module will analyze a page's metadata and computed styles to make an intelligent decision on whether to apply the theme.

**Expected Outcome / Acceptance Criteria:**

* Review file: consultant_recommendations/dark_theme_engines_design.md for specific design details THAT ARE TO BE FOLLOWED!
* The module first checks for native dark mode signals: `window.matchMedia('(prefers-color-scheme: dark)').matches` and the `color-scheme` meta tag/CSS property.
* If metadata is inconclusive, the module samples the `background-color` of the `<body>` and 5 random, deeply-nested `<div>` elements.
* It calculates the average Relative Luminance for the sampled backgrounds; if the average is less than 0.2, the page is classified as "inherently dark".
* If the page is detected as dark, the theme injection is skipped (`SKIP_INJECTION`).
* A `force_enable` flag in the user settings can override this detection logic.

**Status:** DONE

***

# Task 3 - Implement Algorithm 1: "Photon Inverter"

**Priority:** HIGH

**Goal / Why:**
Implement the first of the new engines, a high-performance solution based on CSS filters. This engine serves as the baseline for low-power devices and structurally simple pages, providing a quick and efficient dark mode.

**Expected Outcome / Acceptance Criteria:**

* Review file: consultant_recommendations/dark_theme_engines_design.md for specific design details THAT ARE TO BE FOLLOWED!
  Below is a summary of the implementation requirements. USE THE DESIGN FILE AS THE PRIMARY REFERENCE!
* A CSS rule `filter: invert(100%) hue-rotate(180deg);` is injected and applied to the `<html>` element when this algorithm is active.
* A secondary CSS rule is injected to target `img, video, canvas, [style*="background-image"]`.
* This secondary rule re-applies the same filter (`invert(100%) hue-rotate(180deg)`) to cancel the effect on media elements, rendering them normally.
* The engine accepts user-modifiable values for brightness and contrast, appending them to the filter rule (e.g., `brightness(0.9) contrast(1.1)`).

**Status:** DONE

***

# Task 4 - Implement Algorithm 2: "DOM Walker"

**Priority:** MEDIUM

**Goal / Why:**
To provide a more nuanced and readable dark theme than simple inversion, this algorithm will traverse the DOM, analyze computed styles, and replace colors based on their lightness, preserving brand identity and improving text clarity.

**Expected Outcome / Acceptance Criteria:**

* Review file: consultant_recommendations/dark_theme_engines_design.md for specific design details THAT ARE TO BE FOLLOWED!
  Below is a summary of the implementation requirements. USE THE DESIGN FILE AS THE PRIMARY REFERENCE!
* The engine uses `document.createTreeWalker` to iterate over all relevant DOM nodes.
* Processing is batched using `requestAnimationFrame` to avoid blocking the main thread.
* For each element, `color` and `background-color` are converted from RGB to HSL.
* Lightness (L) is inverted for both backgrounds (`L > 50%`) and foregrounds (`L < 50%`), while Hue and Saturation are preserved.
* A `MutationObserver` is attached to the `<body>` to detect and process dynamically added nodes (e.g., from infinite scrolling).
* Transparent backgrounds are handled by traversing up the DOM tree to find the nearest opaque parent for color context.

**Status:** DONE

***

# Task 5 - Implement Algorithm 3: "Chroma-Semantic Engine"

**Priority:** MEDIUM

**Goal / Why:**
This is the most advanced engine, designed for complex web applications. It uses semantic analysis and a perceptually uniform color space (LCH) to create a high-fidelity, accessible, and performant dark theme that respects visual hierarchy.

**Expected Outcome / Acceptance Criteria:**

* Review file: consultant_recommendations/dark_theme_engines_design.md for specific design details THAT ARE TO BE FOLLOWED!
  Below is a summary of the implementation requirements. USE THE DESIGN FILE AS THE PRIMARY REFERENCE!
* The engine scans `document.styleSheets` to find and modify CSS Custom Properties (`--variable-name`) directly for maximum performance.
* Elements are classified semantically (e.g., via ARIA roles) to apply context-aware styling (e.g., body vs. modals, links vs. plain text).
* Colors are converted to the LCH color space to ensure all color modifications meet a minimum WCAG AA (4.5:1) perceptual contrast ratio.
* For raw RGB manipulation, bitwise operations are used for performance gains over string parsing.
* A performance monitor is included: if engine execution exceeds 200ms, it automatically falls back to Algorithm 1 ("Photon Inverter") and notifies the user.

**Status:** DONE

***

# Task 6 - Update UI for Algorithm Selection & Per-Site Configuration

**Priority:** HIGH

**Goal / Why:**
To expose the power of the new engines to the user, the extension's popup UI must be updated. Users need to be able to select their preferred algorithm and save that choice on a per-site basis.

**Expected Outcome / Acceptance Criteria:**

* Review file: consultant_recommendations/dark_theme_engines_design.md for specific design details.
  Below is a summary of the implementation requirements. USE THE DESIGN FILE AS THE PRIMARY REFERENCE!
* The popup UI contains a new control (e.g., a dropdown or radio button group) listing the new theme engines: "Photon Inverter," "DOM Walker," and "Chroma-Semantic Engine."
* The user's selection is applied to the current page in real-time.
* When a user saves a "per-site" configuration, the currently selected algorithm's identifier is included in the saved data.
* When visiting a site with a saved configuration, the correct algorithm is automatically loaded and applied.
* A global default algorithm can be set in the main options page.

**Status:** DONE

***

# Task 7 - Implement Debounced User Control Modifiers

**Priority:** MEDIUM

**Goal / Why:**
To allow users to fine-tune theme parameters (e.g., brightness, contrast) without causing performance degradation, all UI slider/input controls must use a debounce mechanism. This ensures heavy calculations only run after the user has finished making their adjustment.

**Expected Outcome / Acceptance Criteria:**

* Review file: consultant_recommendations/dark_theme_engines_design.md for specific design details.
  Below is a summary of the implementation requirements. USE THE DESIGN FILE AS THE PRIMARY REFERENCE!
* UI controls for brightness, contrast, sepia, etc., trigger updates on an `input` event.
* A debounce function with a timeout of ~150ms is used to wrap the theme recalculation logic.
* While a user is actively adjusting a slider, a computationally "cheap" preview (e.g., a temporary CSS filter) provides instant visual feedback.
* The full, computationally "expensive" algorithmic recalculation is executed only after the debounce timeout completes.
* Preference changes are saved to storage only after 1000ms of user inactivity to reduce write operations.

**Status:** DONE

***

# Task 8 - Implement "Developer Mode" for Debug Logging

**Priority:** HIGH

**Goal / Why:**
To provide developers with detailed console logs to diagnose issues related to theme application, value calculations, and site classification. This is essential for efficient future debugging and maintenance.

**Expected Outcome / Acceptance Criteria:**

* A global "Developer Mode" toggle is available within the extension's main settings page.
* When Developer Mode is enabled, detailed debug logs are reliably output to the Browser Console for every relevant action.
* All log statements generated by the extension are prepended with `[UltraDark]` for easy filtering.
* Logs must detail the "pre-flight" site classification decision, including the values used to make the determination.
* Logs must show CSS/DOM modifications, including before-and-after values for colors and styles.
* When Developer Mode is disabled, no debug logs from the extension are produced in the console.

**Status:** DONE

***

# Task 9 - Create Unit Test Suite for New Engines & Logic

**Priority:** HIGH

**Goal / Why:**
To ensure the long-term stability, correctness, and maintainability of the new theme engines and detection logic, a comprehensive suite of unit tests must be created. This safeguards against future regressions.

**Expected Outcome / Acceptance Criteria:**

* Unit tests are created for the Theme Detection Module, covering various scenarios (metadata, light/dark computed styles).
* Each theme algorithm has its own set of unit tests to validate its color conversion logic against known inputs and expected outputs.
* Helper functions (e.g., RGB-to-LCH conversion, bitwise operations) are covered by dedicated unit tests.
* The test suite is integrated into the development workflow and can be run via a package script (e.g., `npm test`).
* All new, critical logic introduced in this sprint has corresponding test coverage.

**Status:** DONE

***

# Task 10 - Review and Fix Linting Errors and Warnings

**Priority:** LOW

**Goal / Why:**
To improve overall code quality, consistency, and prevent potential bugs by ensuring the codebase adheres to the established linting rules.

**Expected Outcome / Acceptance Criteria:**

* The project's linting script is executed across the entire codebase.
* All reported linting errors are fixed.
* All reported linting warnings are reviewed and resolved.
* The linting command completes successfully with zero errors or warnings.

**Status:** DONE

