import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@code-proxy/i18n";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  const ensureStorage = (key: "localStorage" | "sessionStorage") => {
    if (typeof window[key] !== "undefined") {
      return;
    }
    const store = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (itemKey: string) => store.get(itemKey) ?? null,
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (itemKey: string) => {
        store.delete(itemKey);
      },
      setItem: (itemKey: string, value: string) => {
        store.set(itemKey, String(value));
      },
    };
    Object.defineProperty(window, key, {
      configurable: true,
      value: storage,
    });
  };

  ensureStorage("localStorage");
  ensureStorage("sessionStorage");

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }
}

if (typeof globalThis !== "undefined" && !(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {
      // noop
    }
    unobserve() {
      // noop
    }
    disconnect() {
      // noop
    }
  };
}
