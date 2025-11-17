* Add plenty of toggleable dev mode / debug statements to assist with future debugging.
 - THis should include: 
     - Prepend '[UltraDark]' to all debug log statements.
     - Any thing that would be useful to debug dark theme issues.
         - Current values, new values calculated etc.
         - What is being modified on the page, CSS / DOM elements / RGB values - both current and new OR new and old values (after) calculation.
     - Why and how the current page was classified as already have a dark or light theme.
         - The values and elements used in the classification algorithm.

* When clicking the extension icon in the toolbar - Save the current active tab URL to a variable, so that when the 'Add Current Site' button is clicked it adds the correct site rather than the moz-extension url. Update the 'Add Current Site' button to 'Add Active Site' to reflect this change, ensure it uses the same variable.
 - Create unit tests for this functionality.

* When clicking the extension icon in the toolbar - add a button to set the dark mode values (brightness, contrast, sepia, greyscale, blueshift) to default values for the page rather than resetting the global defaults for all pages.
 - Create unit tests for this functionality

* Add a debounce to the sliders in the popup to prevent excessive updates to the page when adjusting them.
 - Create unit tests for this functionality.
