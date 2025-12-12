COMPLETE THE BELOW TASKS:

# Task 1 - Refactor Dark Theme Detection to Exclude User Preference

**Priority:** HIGH

**Goal / Why:**
The current dark theme detection logic in `src/utils/dark-detection.ts` incorrectly uses `siteDeclaresColorScheme()` as a factor. This function only checks the user's system-wide `prefers-color-scheme` setting, which does not accurately indicate if the *website itself* is currently rendered in a dark theme. Removing this check is critical for making the auto-detection logic more reliable.

**Expected Outcome / Acceptance Criteria:**

*   All calls to `siteDeclaresColorScheme()` must be removed from the dark theme detection calculation within `src/utils/dark-detection.ts`.
*   The weighting given to the `prefers-color-scheme` media query in the overall "is this site dark?" score must be zero.
*   The detection algorithm must rely solely on analyzing the actual DOM and CSS of the loaded page.
*   If the `siteDeclaresColorScheme()` function is no longer used anywhere else in the extension after this change, it must be deleted entirely to remove dead code.

**Status:** TODO

---
# Task 2 - Dynamically Disable Unused UI Sliders in Popup

**Priority:** MEDIUM

**Goal / Why:**
To improve user experience and reduce confusion, the control sliders in the extension popup should be enabled or disabled based on the currently active algorithm. This provides clear, immediate feedback to the user about which settings are relevant to their current selection.

**Expected Outcome / Acceptance Criteria:**

*   When a user selects a theming algorithm (e.g., "Chroma-Semantic") from the popup dropdown, all sliders and controls related to *other* algorithms must receive the `disabled` attribute and appear grayed out.
*   The controls for the currently active algorithm must be enabled.
*   This enabled/disabled state must update in real-time as the user switches between different algorithms in the popup UI.
*   The logic must be stored and executed within the popup's script files (`popup.html`/`popup.js`).

**Status:** TODO

---
# Task 3 - Implement Tests for Context-Aware UI Controls

**Priority:** MEDIUM

**Goal / Why:**
To prevent future regressions and ensure the dynamic UI logic from Task 2 is robust, automated tests are needed. These tests will programmatically verify that the sliders correctly enable and disable based on the selected algorithm.

**Expected Outcome / Acceptance Criteria:**

*   A new set of unit or integration tests is added to the project's test suite.
*   The tests must simulate a user selecting each of the available theming algorithms.
*   For each simulated selection, tests will assert that the correct set of UI controls has the `disabled` attribute and the active set does not.
*   The tests must cover all algorithms and their associated UI controls to ensure complete coverage.

**Status:** TODO

---
# Task 4 - Ensure Code Lints and Passes All Tests

**Priority:** LOW

**Goal / Why:**
This is a final quality assurance step to verify that all recent code modifications adhere to project standards, are free of syntax errors, and have not introduced any regressions in other parts of the extension.

**Expected Outcome / Acceptance Criteria:**

*   The project's linting command must execute and report zero errors.
*   The project's entire test suite, including any newly added tests, must run completely and all tests must pass.
*   The final commit should result in a successful build in the continuous integration (CI) pipeline.

**Status:** TODO

---
# Task 5 - Retrospective: Update AGENTS.md with Missing Architectural Context

**Priority:** LOW

**Goal / Why:**
To ensure that future agents (or sessions) have immediate access to critical context that was missing during this development cycle. This reduces token usage on file searching and prevents hallucinations by explicitly documenting details that currently require inference or code exploration to discover.

**Expected Outcome / Acceptance Criteria:**

*   **Review the previous tasks:** Identify specific technical details (e.g., file paths, specific function names like `siteDeclaresColorScheme`, variable connections, or build quirks) that you had to search for, guess, or infer because they were not explicitly documented.
*   **Update `AGENTS.md`:** Add these missing details to the relevant sections (Project Description, Code Style, or Notes).
*   **Focus on friction points:** If you had to read multiple files to understand how a feature works (e.g., how the Popup UI communicates with Content Scripts), document that relationship concisely.
*   **Verify accuracy:** Ensure the new information is factual based on the code you just worked on, not assumed.

**Status:** TODO
