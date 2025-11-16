# Task UD-1 – Detect Native Dark Sites and Avoid Double Dark-Theming

**Priority:** HIGH

**Goal / Why:**
Many modern websites already ship high-quality dark themes. Applying UltraDark Reader on top can cause unreadable contrast, color distortions, and user frustration. Automatically detecting when a site is already dark and disabling UltraDark (unless overridden) improves readability and perceived quality.

**Expected Outcome / Acceptance Criteria:**

* UltraDark detects whether the current site is already using a dark theme (e.g., via `prefers-color-scheme: dark`, average background luminance, or heuristics).
* If a site is detected as “already dark”, UltraDark’s dark mode is **not** applied by default.
* A per-site override allows users to force UltraDark on dark sites and to disable detection logic for that site.
* Detection logic does **not** significantly slow down page load or cause noticeable flicker when toggling.
* No regression: sites that are light-themed continue to get UltraDark applied as before.
* Manual QA verifies behavior on at least 5 known dark sites (e.g., GitHub dark mode, YouTube dark, Reddit dark, etc.) and 5 light sites.
* Unit/functional tests cover:
  * A site declaring `prefers-color-scheme: dark`.
  * A site with dark background but no explicit dark scheme declaration.
  * A site falsely matching detection heuristics and ensuring overrides work.

**Status:** DONE


# Task UD-2 – Implement New Popup UI from Mockups

**Priority:** HIGH

**Goal / Why:**
The current popup UI is functional but clunky and confusing. Implementing a new design based on `mockup/UltraDark-MockUp-popup.html` and `mockup/UltraReader-Mockup-Options_and_regex.html` will improve usability, discoverability of features, and overall polish of the extension.

**Expected Outcome / Acceptance Criteria:**

* The popup UI layout and styling match the intent of `mockup/UltraDark-MockUp-popup.html` for the main view and `mockup/UltraReader-Mockup-Options_and_regex.html` for the secondary/options view (within reasonable platform constraints).
* The popup supports navigation between:
  * Main control view (on/off, quick actions).
  * Options/regex/advanced settings view.
* All existing popup functionality (on/off toggle, per-site overrides access, regex exclusions access, etc.) remains available in the new UI.
* Popup UI remains responsive and usable at typical Firefox popup sizes, without horizontal scrollbars.
* UI elements are keyboard accessible (tab order logical, focus styles visible, Space/Enter works on interactive elements).
* All text and controls are accessible (sufficient contrast, ARIA roles where needed, screen-reader friendly labels).
* No console errors or uncaught exceptions are produced by opening or interacting with the popup.
* Manual QA confirms that existing users can still perform all prior key actions (turning extension on/off, managing site overrides, editing regexes) without confusion.

**Status:** TODO


# Task UD-3 – Fix Per-Site Overrides & Regex Options UX Issues in Popup

**Priority:** HIGH

**Goal / Why:**
The old “options and regex” popup screen contains multiple UX and logic issues (bad handling of `moz-extension` URLs, no way to remove overrides, confusing enabled/exclude toggles, unnecessary “Save” button, and visible test result placeholder). Fixing these in the new design reduces errors and makes configuration intuitive.

**Expected Outcome / Acceptance Criteria:**

* Per-site override creation:
  * “Refresh current site” (or equivalent add-site action) **never** adds URLs that don’t start with `http://` or `https://`.
  * Pages with schemes like `moz-extension://`, `about:`, `file://`, etc. are **not** eligible for per-site overrides.
* Per-site override removal:
  * Each per-site entry has a clear way to delete/remove it (e.g., trash icon or dedicated “Remove” action).
  * Removing an entry updates both the UI and stored configuration immediately (no reload required).
* Mutually exclusive enable/exclude:
  * Per-site settings use a mutually exclusive control (radio buttons, segmented control, or slider) rather than independent checkboxes.
  * States and wording are clarified; for example:
    * “Always on” / “Disabled on this site”, or
    * “Use UltraDark” / “Exclude from UltraDark”.
  * Only one state can be active at a time for a given site.
* Autosave behavior:
  * All changes to per-site settings (enable/exclude state, removal, additions) are autosaved without requiring a separate “Save” button.
  * There is no visible “Save” button; existing “Save” controls are removed or disabled.
  * Autosave feedback is provided where appropriate (e.g., slight visual confirmation or disabled state after change).
* Regex test result visibility:
  * The `div#testResult.badge` (or equivalent result indicator) is **hidden on initial load** when no test has been run.
  * The result badge only appears after a user runs a regex test and shows a clear “match / no match / error” state.
* On/Off toggle clarity:
  * Global on/off is represented by a clear slider/toggle indicating two distinct states (e.g., “On | Off”).
  * The toggle is visually obvious as interactive and not just static text.
* Testing:
  * Manual QA verifies all 6 issues in the original list are resolved in the new popup design.
  * Automated tests (where feasible) confirm:
    * `moz-extension://` and other non-HTTP(S) schemes are not added as per-site overrides.
    * Site removal and state toggling persist across popup reopen and browser restart.

**Status:** TODO


# Task UD-4 – Set Up GitHub CI Pipeline to Build and Test Extension

**Priority:** MEDIUM

**Goal / Why:**
Manually building and packaging the extension is error-prone and slows down releases. A GitHub-based build pipeline with tests ensures consistent builds, catches breakages early, and produces a ready-to-upload ZIP for AMO.

**Expected Outcome / Acceptance Criteria:**

* A GitHub Actions workflow (or equivalent CI config) is added to the repository under `.github/workflows/`.
* On pushes to `main` and on pull requests:
  * CI installs dependencies (e.g., `npm install` / `pnpm install` / `yarn install` depending on repo).
  * CI runs the existing test suite (unit/integration/linters). Builds fail if tests fail.
  * CI runs the build script that produces the `dist/` folder.
* A CI step packages the final `dist/` tree into a ZIP file suitable for Firefox/AMO submission.
* Build artifacts (ZIP and optionally `dist/`) are uploaded as workflow artifacts for download from the GitHub Actions run.
* The workflow is parameterized so version/tag builds (e.g., pushing a tag `vX.Y.Z`) also run the pipeline and produce artifacts.
* Documentation is added/updated (`README` or `CONTRIBUTING`) explaining:
  * How the CI pipeline works.
  * How to retrieve the built ZIP from GitHub Actions.
* A sample successful workflow run is verified in GitHub (green build with downloadable extension ZIP).

**Status:** DONE
