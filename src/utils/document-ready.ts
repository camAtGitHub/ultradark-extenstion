// src/utils/document-ready.ts

/**
 * Wait for document body to be available and DOM to be in a usable state
 * This is critical for algorithms that traverse document.body
 */
export async function waitForDocumentReady(): Promise<void> {
  // If body already exists and document is at least interactive, we're good
  if (document.body && document.readyState !== 'loading') {
    return Promise.resolve();
  }

  // Otherwise, wait for DOMContentLoaded or body to appear
  return new Promise<void>((resolve) => {
    // Check for body periodically in case we're very early
    if (!document.body) {
      const checkBody = setInterval(() => {
        if (document.body) {
          clearInterval(checkBody);
          // Still wait for interactive state
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
          } else {
            resolve();
          }
        }
      }, 10); // Check every 10ms
    } else {
      // Body exists, just wait for DOMContentLoaded
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    }
  });
}

/**
 * Check if document body is currently available
 */
export function isDocumentBodyReady(): boolean {
  return document.body !== null && document.body !== undefined;
}
