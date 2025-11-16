* add dark mode detection on websites with dark themes already and then dont apply our dark mode.
* Redesign the popup UI based on the file 'UltraDark-MockUp-popup.html' and its secondary page 'UltraReader-Mockup-Options_and_regex.html'
* With regards to the pop-up UI in particular the old version  on the 'options and regex page' a number of issues existed as per below. Ensure that all the below issues are resolved in the new design:
        1. The refresh current site button - it Only ever exists on a page beginning with "moz-extension" - clicking 'refresh current site' both adds the "moz-extension://{uuid}" to the per site override as sites that can be adjusted which it can't! So any page not beginning with HTTP should not be able to be added.
        2. There should be a button to del/remove sites from per site overrides. 
        3. Enabled and exclude are mutually exclusive therefore perhaps a slider that alternates between the two is a better idea than tick boxes. Perhaps even radio buttons are better. I think the wording could be explored as well, re: 'enabled and exclude' maybe something like 'disabled and always on', i'm not too sure.
        4. Clicking save seems unneeded autosave should be implemented especially in regards to if a radio button or a slider was implemented (as per above).
        5. Um The Regex Exclusions section under the word test there is a little bit of UI (div#testResult.badge) that is showing even when not activated. eg. will be visible on page load without results of regex tests.
        6. the on-off functionality should be toggled with a slider that indicates to a user there are options (on|off) vs just displaying the values (that can 'secretly' be toggled).
* Setup a github build pipeline with build tests etc to create the extension zip file.
