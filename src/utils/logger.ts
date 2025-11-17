// src/utils/logger.ts

/**
 * Centralized logging utility for UltraDark Reader
 * Provides toggleable debug logging with consistent prefix
 */

const LOG_PREFIX = '[UltraDark]';

/**
 * Check if debug mode is enabled
 */
async function isDebugEnabled(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get('isDebugMode');
    return result.isDebugMode === true;
  } catch {
    // If storage fails, default to false
    return false;
  }
}

/**
 * Log a debug message (only when debug mode is enabled)
 */
export async function debug(...args: unknown[]): Promise<void> {
  if (await isDebugEnabled()) {
    console.log(LOG_PREFIX, ...args);
  }
}

/**
 * Log an info message (always visible)
 */
export function info(...args: unknown[]): void {
  console.info(LOG_PREFIX, ...args);
}

/**
 * Log a warning message (always visible)
 */
export function warn(...args: unknown[]): void {
  console.warn(LOG_PREFIX, ...args);
}

/**
 * Log an error message (always visible)
 */
export function error(...args: unknown[]): void {
  console.error(LOG_PREFIX, ...args);
}

/**
 * Synchronous debug logger for contexts where async is not available
 * Uses cached state - may not reflect immediate changes to debug setting
 */
let debugModeCache = false;

export function updateDebugCache(enabled: boolean): void {
  debugModeCache = enabled;
}

export function debugSync(...args: unknown[]): void {
  if (debugModeCache) {
    console.log(LOG_PREFIX, ...args);
  }
}

/**
 * Initialize debug cache from storage
 */
export async function initDebugCache(): Promise<void> {
  debugModeCache = await isDebugEnabled();
}
