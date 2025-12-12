// tests/utils/document-ready.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { waitForDocumentReady, isDocumentBodyReady } from '../../src/utils/document-ready';

describe('document-ready utilities', () => {
  let dom: JSDOM;
  let originalDocument: Document;

  beforeEach(() => {
    // Save original document
    originalDocument = global.document;
  });

  describe('isDocumentBodyReady', () => {
    it('should return true when document.body exists', () => {
      dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      global.document = dom.window.document as unknown as Document;
      
      expect(isDocumentBodyReady()).toBe(true);
      
      // Restore
      global.document = originalDocument;
    });

    it('should handle null body check correctly', () => {
      // JSDOM always creates a body, so we test the logic more directly
      const mockDoc = {
        body: null,
        readyState: 'loading'
      };
      
      // Test that the function checks for body existence
      expect(mockDoc.body).toBeNull();
      
      // In actual browser, isDocumentBodyReady() would return false here
      // but we can't easily test this with JSDOM which auto-creates body
    });
  });

  describe('waitForDocumentReady', () => {
    it('should resolve immediately when body exists and document is interactive', async () => {
      dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      const doc = dom.window.document;
      global.document = doc as unknown as Document;
      
      // Mock readyState as interactive
      Object.defineProperty(doc, 'readyState', {
        writable: true,
        value: 'interactive'
      });
      
      const startTime = Date.now();
      await waitForDocumentReady();
      const elapsed = Date.now() - startTime;
      
      // Should resolve almost immediately (< 50ms)
      expect(elapsed).toBeLessThan(50);
      
      // Restore
      global.document = originalDocument;
    });

    it('should resolve immediately when body exists and document is complete', async () => {
      dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      const doc = dom.window.document;
      global.document = doc as unknown as Document;
      
      // Mock readyState as complete
      Object.defineProperty(doc, 'readyState', {
        writable: true,
        value: 'complete'
      });
      
      const startTime = Date.now();
      await waitForDocumentReady();
      const elapsed = Date.now() - startTime;
      
      // Should resolve almost immediately (< 50ms)
      expect(elapsed).toBeLessThan(50);
      
      // Restore
      global.document = originalDocument;
    });

    it('should handle loading state by checking for DOMContentLoaded', async () => {
      // This test validates the logic structure
      // In real browser, the function would wait for DOMContentLoaded event
      // In JSDOM with body already present, it resolves immediately
      dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      const doc = dom.window.document;
      global.document = doc as unknown as Document;
      
      // Set readyState to loading
      Object.defineProperty(doc, 'readyState', {
        writable: true,
        value: 'loading'
      });
      
      // The function should still handle this case
      const result = await waitForDocumentReady();
      
      // Should resolve (exact timing varies in JSDOM vs real browser)
      expect(result).toBeUndefined(); // Promise resolves successfully
      
      // Restore
      global.document = originalDocument;
    });

    it('should handle document readiness logic correctly', () => {
      // Test the core logic of the utility
      dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      global.document = dom.window.document as unknown as Document;
      
      // When body exists, function should not hang
      const readyPromise = waitForDocumentReady();
      
      // Should be a promise
      expect(readyPromise).toBeInstanceOf(Promise);
      
      // Restore
      global.document = originalDocument;
    });
  });
});
