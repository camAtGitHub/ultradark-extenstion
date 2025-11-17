* Add plenty of toggleable dev mode / debug statements to assist with future debugging.
  WHEN DEVELOPER MODE IS ENABLED PLUGIN-WIDE, IT MUST OUTPUT DEBUG LOGS TO THE CONSOLE. THERE ARE 
 - THis should include: 
     - Prepend '[UltraDark]' to all debug log statements.
     - Any thing that would be useful to debug dark theme issues.
         - Current values, new values calculated etc.
         - What is being modified on the page, CSS / DOM elements / RGB values - both current and new OR new and old values (after) calculation.
     - Why and how the current page was classified as already have a dark or light theme. (CURRENTLY MISSING/BROKEN)
         - The values and elements used in the classification algorithm.


* When clicking the extension icon in the toolbar - Change the 'reset site defaults' button to change the current/active slider values (brightness, contrast, sepia, greyscale, blueshift) to default values / normal / sane values that they should be (perhaps default values). This should only affect the slider values / current page, nothing else, unless they then clicked 'add active site', but that is the status-quo anyway. Change the wording to 'reset sliders'. 
 - Create unit tests for this functionality

* Where are changes being saved to local storage? Create a document that outlines where each setting is saved in local storage, and what it affects. This will help with future debugging and development.

* CRITICAL BUG - Artifacts generated may linger after plugin switched off and/or values reset to default values. There are reports that this has left pages broken and until a browser restart.

* Remove the button 'add current site' under the per-site overrides. This button doesnt work.
