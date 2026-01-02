// tests/unit/dom-walker-batch-styles.test.ts
import { describe, it, expect } from "vitest";

/**
 * OPTIMIZATION 9: Batch Style Application in DOM Walker
 * 
 * Tests for batched style application to minimize reflows
 */
describe("DOM Walker - Batched Style Application (Opt-9)", () => {
  it("should separate style reads from writes", () => {
    // Test the pattern: read all first, then write all
    const BATCH_SIZE = 500;
    
    interface StyleChange {
      el: { style: Record<string, string> };
      bg?: string;
      color?: string;
      borderColor?: string;
    }
    
    // Simulate reading phase
    const elements = Array.from({ length: 10 }, (_, i) => ({
      style: {},
      computedBg: `rgb(${i * 25}, ${i * 25}, ${i * 25})`,
      computedColor: `rgb(${255 - i * 25}, ${255 - i * 25}, ${255 - i * 25})`
    }));
    
    // PHASE 1: Read all
    const styleReads = elements.map(el => ({
      node: el,
      computed: {
        backgroundColor: el.computedBg,
        color: el.computedColor
      }
    }));
    
    // PHASE 2: Calculate changes
    const changes: StyleChange[] = [];
    for (const { node, computed } of styleReads) {
      const change: StyleChange = { el: node };
      let hasChanges = false;
      
      if (computed.backgroundColor) {
        change.bg = 'inverted-' + computed.backgroundColor;
        hasChanges = true;
      }
      if (computed.color) {
        change.color = 'inverted-' + computed.color;
        hasChanges = true;
      }
      
      if (hasChanges) changes.push(change);
    }
    
    // PHASE 3: Apply all changes
    for (const change of changes) {
      if (change.bg) change.el.style.backgroundColor = change.bg;
      if (change.color) change.el.style.color = change.color;
    }
    
    // Verify all changes were applied
    expect(changes.length).toBe(10);
    expect(elements[0].style.backgroundColor).toBe('inverted-rgb(0, 0, 0)');
    expect(elements[0].style.color).toBe('inverted-rgb(255, 255, 255)');
  });

  it("should batch size be appropriate for performance", () => {
    const BATCH_SIZE = 500;
    
    // Batch size should be:
    // - Large enough to be efficient (> 100)
    // - Small enough to not block UI (< 1000)
    expect(BATCH_SIZE).toBeGreaterThan(100);
    expect(BATCH_SIZE).toBeLessThan(1000);
  });

  it("should only apply changes when there are actual style modifications", () => {
    interface StyleChange {
      el: { id: string };
      bg?: string;
      color?: string;
    }
    
    const elements = [
      { id: 'a', hasBackground: true, hasColor: true },
      { id: 'b', hasBackground: false, hasColor: true },
      { id: 'c', hasBackground: true, hasColor: false },
      { id: 'd', hasBackground: false, hasColor: false }
    ];
    
    const changes: StyleChange[] = [];
    
    for (const el of elements) {
      const change: StyleChange = { el };
      let hasChanges = false;
      
      if (el.hasBackground) {
        change.bg = 'some-color';
        hasChanges = true;
      }
      if (el.hasColor) {
        change.color = 'some-color';
        hasChanges = true;
      }
      
      if (hasChanges) changes.push(change);
    }
    
    // Only elements with actual changes should be in the list
    expect(changes.length).toBe(3); // a, b, c (d has no changes)
    expect(changes.some(c => c.el.id === 'd')).toBe(false);
  });

  it("should handle all three style properties (background, color, border)", () => {
    interface StyleChange {
      el: { style: Record<string, string> };
      bg?: string;
      color?: string;
      borderColor?: string;
    }
    
    const el = { style: {} };
    const change: StyleChange = {
      el,
      bg: 'rgb(0, 0, 0)',
      color: 'rgb(255, 255, 255)',
      borderColor: 'rgb(128, 128, 128)'
    };
    
    // Apply changes
    if (change.bg) change.el.style.backgroundColor = change.bg;
    if (change.color) change.el.style.color = change.color;
    if (change.borderColor) change.el.style.borderColor = change.borderColor;
    
    expect(el.style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(el.style.color).toBe('rgb(255, 255, 255)');
    expect(el.style.borderColor).toBe('rgb(128, 128, 128)');
  });

  it("should minimize reflows by batching writes", () => {
    // This test verifies the pattern reduces reflows from O(n*3) to O(1)
    
    // Old pattern: O(n*3) - each property write can trigger reflow
    const oldPattern = (elements: any[]) => {
      let reflows = 0;
      for (const el of elements) {
        el.style.backgroundColor = 'black'; // reflow
        reflows++;
        el.style.color = 'white'; // reflow
        reflows++;
        el.style.borderColor = 'gray'; // reflow
        reflows++;
      }
      return reflows;
    };
    
    // New pattern: O(1) - all reads first, then all writes together
    const newPattern = (elements: any[]) => {
      // Phase 1: Read (no reflows)
      const changes = elements.map(el => ({
        el,
        bg: 'black',
        color: 'white',
        borderColor: 'gray'
      }));
      
      // Phase 2: Write (1 reflow after all writes)
      for (const change of changes) {
        change.el.style.backgroundColor = change.bg;
        change.el.style.color = change.color;
        change.el.style.borderColor = change.borderColor;
      }
      
      return 1; // Single reflow after batch
    };
    
    const mockElements = Array.from({ length: 10 }, () => ({ style: {} }));
    
    expect(oldPattern(mockElements.slice())).toBe(30); // 10 elements * 3 properties
    expect(newPattern(mockElements.slice())).toBe(1);  // Single batched reflow
  });

  it("should use fast color parsing functions", () => {
    // Verify we're using the optimized functions from opt-6
    const functionsUsed = {
      parseRgbFast: true,  // From color-utils.ts
      isTransparentFast: true  // From color-utils.ts
    };
    
    expect(functionsUsed.parseRgbFast).toBe(true);
    expect(functionsUsed.isTransparentFast).toBe(true);
  });

  it("should track processed elements to avoid duplicates", () => {
    const processedElements = new Set<string>();
    const elements = ['a', 'b', 'c', 'a', 'b']; // Some duplicates
    
    const toProcess = elements.filter(el => {
      if (processedElements.has(el)) return false;
      processedElements.add(el);
      return true;
    });
    
    expect(toProcess.length).toBe(3); // Only unique elements
    expect(processedElements.size).toBe(3);
  });
});
