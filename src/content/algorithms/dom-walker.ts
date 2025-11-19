// src/content/algorithms/dom-walker.ts

/**
 * Algorithm 2: "DOM Walker" (Intermediate / Style Parsing)
 * 
 * Strategy: Recursive DOM Traversal & Computed Style Replacement
 * Complexity: O(n) where n is DOM nodes
 * Use Case: Standard websites, blogs, documentation where readability is key
 * 
 * PLACEHOLDER: This algorithm will be implemented in Task 4
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";
import { applyPhotonInverter } from "./photon-inverter";

/**
 * Apply the DOM Walker algorithm to the page
 * TEMPORARY: Falls back to Photon Inverter until fully implemented
 */
export function applyDomWalker(settings: Settings): void {
  debugSync('[DOM Walker] Algorithm not yet implemented, falling back to Photon Inverter');
  applyPhotonInverter(settings);
  document.documentElement.setAttribute("data-udr-mode", "dom-walker");
}
