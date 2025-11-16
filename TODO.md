* Add plenty of toggleable debug statement to assist with future debugging.

* With regards to the pop-up UI in particular the old version  on the 'options and regex page' a number of issues existed as per below. Ensure that all the below issues are resolved in the new design:
        1. The refresh current site button - it Only ever exists on a page beginning with "moz-extension" - clicking 'refresh current site' both adds the "moz-extension://{uuid}" to the per site override as sites that can be adjusted which it can't!  It should somehow add the site (browser tab) that was active when the first popup button (for the extension) was added.
        2. The inital popup should should have some wordage / label indictating what the master on|off slider is.
* Add a reset to default values on the popup UI.
* Fix dark mode detection on websites with dark themes already and then dont apply our dark mode (possible solved with new algo rewrite) - utilise debug logs to help identify issues.
* Implement newly revised dark mode algorithms (two seperate algorithms to choose from). (Rewrite and reimplement the dark mode algorithms x2)
* Fix light themed flashing white before the dark mode is applied on page load.
