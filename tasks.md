# Task 1 - Implement Toggleable Debug Logging

**Priority:** MEDIUM

**Goal / Why:**
To improve future debugging efficiency by providing detailed, contextual log statements for core extension functionality. This will help developers quickly identify issues related to theme application, site classification, and dynamic value calculations without impacting production performance.

**Expected Outcome / Acceptance Criteria:**

* A global `devMode` or `debug` flag is implemented, which can be toggled (e.g., in `storage.local`) to enable or disable console logging.
* All `console.log` statements related to this task are conditional on the debug flag being enabled.
* All log outputs are prepended with the string `[UltraDark]` for easy filtering in the browser console.
* Logs are added to the theme classification logic, detailing which elements were analyzed and what values led to the light vs. dark determination.
* Logs are added to the dynamic styling engine, outputting old vs. new CSS values (e.g., RGB, brightness, contrast) being applied to elements.
* When the debug flag is disabled, no logs from this system appear in the console.

**Status:** DONE

---
# Task 2 - Fix 'Add Current Site' URL capture and Update Button

**Priority:** HIGH

**Goal / Why:**
The "Add Current Site" button in the popup UI is incorrectly saving the internal `moz-extension://` URL instead of the active web page's URL. This fix ensures that site-specific settings are correctly applied to the intended website.

**Expected Outcome / Acceptance Criteria:**

* When the extension popup is opened, the URL of the currently active tab is immediately captured and stored in a variable.
* The button text in the popup UI is changed from "Add Current Site" to "Add Active Site".
* Clicking the "Add Active Site" button correctly uses the stored active tab URL to create a new per-site rule.
* The functionality works correctly even if the user interacts with the popup UI without immediately clicking the button.
* Unit tests are created to verify that the correct URL is captured and used when the button is clicked.

**Status:** DONE

---
# Task 3 - Add Per-Site 'Reset to Defaults' Button in Popup

**Priority:** MEDIUM

**Goal / Why:**
To allow users to reset the dark mode settings (brightness, contrast, sepia, etc.) for a single, specific website back to the global default values without having to reset all their custom settings for every site.

**Expected Outcome / Acceptance Criteria:**

* A new button, labeled "Reset Site to Defaults" or similar, is added to the popup UI.
* Clicking this button resets all slider values (brightness, contrast, sepia, greyscale, blueshift) for the current active site to the extension's global default values.
* This action only affects the settings for the currently active tab's domain; settings for other custom sites remain unchanged.
* The UI sliders visually update to their new default positions immediately after the button is clicked.
* Unit tests are created to confirm that only the specific site's storage entry is modified, leaving global defaults and other site settings untouched.

**Status:** TODO

---
# Task 4 - Add Debounce to Popup UI Sliders

**Priority:** MEDIUM

**Goal / Why:**
To prevent performance issues and excessive style recalculations caused by rapid, continuous updates while a user is dragging a UI slider. A debounce will ensure the theme is only applied after the user has paused their adjustment, improving responsiveness.

**Expected Outcome / Acceptance Criteria:**

* All sliders in the popup UI (brightness, contrast, sepia, etc.) have a debounce mechanism applied to their input/change event listeners.
* The debounce delay is set to a reasonable value (e.g., 200-300ms) to feel responsive without causing performance strain.
* When a slider is moved, the content script and page styles are not updated on every single pixel of movement. Instead, the update is triggered only after the user stops moving the slider for the specified delay period.
* Unit tests are created to simulate rapid slider events and verify that the underlying update function is called only once after the events cease, not for every event.

**Status:** TODO


# Task 5 - Review and Fix Linting Errors and Warnings

**Priority:** MEDIUM

**Goal / Why:**
To improve code quality, ensure stylistic consistency across the codebase, and catch potential bugs early by resolving all issues identified by the project's static analysis (linting) tools. A clean linting report makes the code more maintainable and easier to onboard new developers.

**Expected Outcome / Acceptance Criteria:**

* The project's linting command (e.g., `npm run lint`) is executed across the entire source code.
* The command completes with **zero errors**.
* All auto-fixable issues (e.g., formatting, spacing) are resolved, preferably using the linter's `--fix` capability.
* All reported warnings are manually reviewed and either fixed or, in justified cases, explicitly ignored with an inline comment explaining the exception.
* The codebase adheres to the established coding standards defined in the linter configuration (e.g., `.eslintrc.js`).

**Status:** DONE
