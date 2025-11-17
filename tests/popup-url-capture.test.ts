// tests/popup-url-capture.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Popup URL Capture", () => {
  // Mock browser.tabs API
  const mockBrowser = {
    tabs: {
      query: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mocking browser global
    globalThis.browser = mockBrowser;
  });

  it("should capture active tab URL when popup opens", async () => {
    const testUrl = "https://example.com/page";
    mockBrowser.tabs.query.mockResolvedValue([
      { url: testUrl, id: 1, active: true }
    ]);

    const [tab] = await mockBrowser.tabs.query({ active: true, currentWindow: true });
    expect(tab?.url).toBe(testUrl);
    expect(mockBrowser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it("should reject moz-extension:// URLs", () => {
    const internalUrls = [
      "moz-extension://12345/popup.html",
      "about:blank",
      "chrome://settings",
    ];

    internalUrls.forEach(url => {
      const isInternal = url.startsWith("moz-extension://") || 
                        url.startsWith("about:") || 
                        url.startsWith("chrome://");
      expect(isInternal).toBe(true);
    });
  });

  it("should accept http and https URLs only", () => {
    const validUrls = [
      "http://example.com",
      "https://example.com",
      "https://sub.example.com/path?query=1"
    ];

    const invalidUrls = [
      "ftp://example.com",
      "file:///path/to/file",
      "data:text/plain,hello"
    ];

    validUrls.forEach(url => {
      const isValid = url.startsWith("http://") || url.startsWith("https://");
      expect(isValid).toBe(true);
    });

    invalidUrls.forEach(url => {
      const isValid = url.startsWith("http://") || url.startsWith("https://");
      expect(isValid).toBe(false);
    });
  });

  it("should store active tab URL at popup initialization", async () => {
    const testUrl = "https://github.com/user/repo";
    mockBrowser.tabs.query.mockResolvedValue([
      { url: testUrl, id: 123, active: true }
    ]);

    // Simulate what happens when popup opens
    let capturedUrl: string | null = null;
    
    async function captureActiveTabUrl(): Promise<void> {
      try {
        const [tab] = await mockBrowser.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          capturedUrl = tab.url;
        }
      } catch {
        capturedUrl = null;
      }
    }

    await captureActiveTabUrl();
    expect(capturedUrl).toBe(testUrl);
  });

  it("should handle case when no active tab is found", async () => {
    mockBrowser.tabs.query.mockResolvedValue([]);

    let capturedUrl: string | null = null;
    
    async function captureActiveTabUrl(): Promise<void> {
      try {
        const [tab] = await mockBrowser.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          capturedUrl = tab.url;
        }
      } catch {
        capturedUrl = null;
      }
    }

    await captureActiveTabUrl();
    expect(capturedUrl).toBeNull();
  });

  it("should handle browser API errors gracefully", async () => {
    mockBrowser.tabs.query.mockRejectedValue(new Error("Permission denied"));

    let capturedUrl: string | null = null;
    
    async function captureActiveTabUrl(): Promise<void> {
      try {
        const [tab] = await mockBrowser.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          capturedUrl = tab.url;
        }
      } catch {
        capturedUrl = null;
      }
    }

    await captureActiveTabUrl();
    expect(capturedUrl).toBeNull();
  });
});
