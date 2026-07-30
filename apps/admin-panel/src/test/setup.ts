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

  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }

  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
}

// jsdom 不实现 IntersectionObserver。framer-motion 的 whileInView 会直接 new 它，
// 缺失时整棵子树渲染即抛错。这里立即回报「已进入视口」，让滚动触发的动画在测试里
// 落到终态，断言看到的就是用户最终看到的内容。
if (typeof globalThis !== "undefined" && !(globalThis as any).IntersectionObserver) {
  (globalThis as any).IntersectionObserver = class IntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
        this as unknown as globalThis.IntersectionObserver,
      );
    }
    unobserve() {
      // noop
    }
    disconnect() {
      // noop
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };
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
