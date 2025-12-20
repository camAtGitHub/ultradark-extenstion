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
  return new Promise<void>((resolve, reject) => {
    // Check for body periodically in case we're very early
    if (!document.body) {
      const POLL_INTERVAL = 50; // 50ms to reduce CPU usage
      const TIMEOUT = 5000; // 5 second timeout to prevent infinite polling
      const startTime = Date.now();
      
      const checkBody = setInterval(() => {
        try {
          // Check for timeout
          if (Date.now() - startTime > TIMEOUT) {
            clearInterval(checkBody);
            reject(new Error('Timeout waiting for document.body to be available'));
            return;
          }
          
          if (document.body) {
            clearInterval(checkBody);
            // Still wait for interactive state
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
            } else {
              resolve();
            }
          }
        } catch (error) {
          clearInterval(checkBody);
          reject(error);
        }
      }, POLL_INTERVAL);
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

/**
 * Wait for the full page load event so that computed styles are stable
 */
export async function waitForPageLoad(timeoutMs = 8000): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for window.load'));
    }, timeoutMs);

    window.addEventListener('load', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
