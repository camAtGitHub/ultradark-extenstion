# Task 1 - Add Toggleable Debug Logging

**Priority:** MEDIUM

**Goal / Why:**
To embed a robust, toggleable logging system throughout the extension's codebase. This will streamline future debugging, help diagnose user-reported issues without impacting general performance, and provide clear insight into the extension's runtime behavior.

**Expected Outcome / Acceptance Criteria:**

*   A centralized logging utility is created and used for all debug messages.
*   Logging can be enabled or disabled via a developer-facing switch in the extension's options UI.
*   This setting is persisted in `storage.local` (e.g., `isDebugMode: true/false`).
*   When disabled, no debug messages should appear in the console.
*   Key events are logged, including: content script injection, algorithm selection and application, messages passed between scripts, and error states.
*   Log messages are prefixed for easy filtering (e.g., `[UltraDark Reader]`).

**Status:** TODO

***

# Task 2 - Resolve Popup UI and 'Refresh Site' Logic Issues

**Priority:** HIGH

**Goal / Why:**
The current popup UI has critical logic flaws that create a confusing and broken user experience. This task aims to fix the 'Refresh Current Site' button's incorrect targeting and improve the UI's clarity, making it intuitive and functional.

**Expected Outcome / Acceptance Criteria:**

*   The 'Refresh Current Site' button, when clicked from the options page, must correctly identify the active user-facing website, not the internal `moz-extension://` page.
*   Applying per-site settings via this button must add the correct domain (e.g., `example.com`) to the overrides list.
*   The system must explicitly prevent `moz-extension://` URLs from being added to the site list.
*   The main on/off slider in the initial popup view must be accompanied by a clear, descriptive label (e.g., "Global Dark Mode").

**Status:** TODO

***

# Task 3 - Improve Detection of Native Dark Themes

**Priority:** HIGH

**Goal / Why:**
To prevent the extension from applying its theme on top of websites that already provide a functional native dark mode. This avoids CSS conflicts, visual degradation, and respects the user's choice when a site-specific dark theme is enabled.

**Expected Outcome / Acceptance Criteria:**

*   The content script must run a check to detect pre-existing dark themes before applying its own styles.
*   Detection logic should check for common patterns like a `dark` class or `data-theme="dark"` attribute on the `<html>` or `<body>` elements AND if they are active.
*   If a native dark theme is detected, the extension's styling is automatically disabled for that page load.
*   Users must be able to manually override this detection and force-enable the theme via the per-site settings.
*   When debug logging is enabled, a message is printed to the console indicating that a native theme was detected and styling was skipped.

**Status:** TODO

***

# Task 4 - Implement 'Reset to Defaults' for Settings

**Priority:** MEDIUM

**Goal / Why:**
To provide users with a straightforward way to revert all custom configurations to the extension's original state. This improves usability by offering a simple recovery method for users who may have misconfigured their settings.

**Expected Outcome / Acceptance Criteria:**

*   A "Reset All Settings to Default" button is added to the extension's options page.
*   Clicking the button must trigger a confirmation dialog (e.g., "Are you sure?") to prevent accidental data loss.
*   Upon confirmation, all user-configured settings stored in `storage.local` (per-site rules, algorithm choice, etc.) are cleared and restored to their initial default values.
*   The options page UI immediately reflects the reset default state.
*   Any open tabs are re-themed to reflect the default settings upon reload.

**Status:** TODO

***


# Task 5 - Rewrite and Implement Dual Dark Mode Algorithms

**Priority:** CRITICAL

**Goal / Why:**
This is a core feature rewrite to replace the current styling logic with two new, superior dark mode algorithms. This will provide users with more choice, better results across a wider variety of websites, and forms the foundation of the extension's value.

**Expected Outcome / Acceptance Criteria:**

*   Follow the designed specifications for "Algorithm A" and "Algorithm B" as outlined in the design document `consultant_recommendations/algo-rewrite.md` (needs better names than A and B). 
*   The two new, distinct dark mode algorithms are fully implemented and can be applied by the content script.
*   The options page includes a setting for the user to choose between "Algorithm A" and "Algorithm B" as the global default.
*   The selected algorithm is correctly applied on page load and during dynamic DOM updates.
*   The performance of both algorithms is optimized to avoid introducing input lag or slow page rendering.
*   The codebase for the algorithms is modular, well-documented, and separated from the main content script logic for maintainability.

**Status:** TODO

***

# Task 6 - Eliminate 'Flash of Unstyled Content' (FOUC) on Load

**Priority:** HIGH

**Goal / Why:**
The brief "flash" of a white page before the dark theme loads creates a jarring and unprofessional user experience. This task aims to eliminate that flash, ensuring a smooth, seamless transition into dark mode from the very start of page navigation.

**Expected Outcome / Acceptance Criteria:**

*   The manifest (`manifest.json`) is configured to inject the primary content script at `document_start`.
*   A minimal, high-priority CSS block is injected instantly to apply a dark background color to the `<html>` and `<body>` elements, preventing the white flash.
*   The full, more complex styling from the main algorithm is applied subsequently without causing a visual flicker.
*   The solution is tested on a slow network connection (throttled) to confirm its effectiveness.
*   Manual QA on a clean profile shows no white flash on at least 5 different complex websites (e.g., Wikipedia, news sites, etc.).

**Status:** DONE
