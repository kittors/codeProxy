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

  // jsdom 缺少 Web Animations API、CSS.escape 与原生 <dialog> showModal/close：
  // Satin 组件的微动效（NumberFlow / initSeg / Toast / Dialog）在测试里走立即完成态。
  if (typeof Element !== "undefined" && !Element.prototype.animate) {
    Element.prototype.animate = (() => {
      const anim: {
        onfinish: (() => void) | null;
        oncancel: (() => void) | null;
        finished: Promise<void>;
        cancel: () => void;
        finish: () => void;
        pause: () => void;
        play: () => void;
      } = {
        onfinish: null,
        oncancel: null,
        finished: Promise.resolve(),
        cancel() {
          this.oncancel?.();
        },
        finish() {
          this.onfinish?.();
        },
        pause() {},
        play() {},
      };
      queueMicrotask(() => {
        anim.onfinish?.();
      });
      return anim as unknown as Animation;
    }) as typeof Element.prototype.animate;
  }

  if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }

  if (typeof HTMLDialogElement !== "undefined") {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute("open", "");
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close(returnValue?: string) {
        if (returnValue !== undefined) this.returnValue = returnValue;
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      };
    }
  }

  if (typeof HTMLElement !== "undefined") {
    if (!("showPopover" in HTMLElement.prototype)) {
      (HTMLElement.prototype as unknown as { showPopover: () => void }).showPopover =
        function showPopover(this: HTMLElement) {
          this.setAttribute("data-popover-open", "true");
        };
    }
    if (!("hidePopover" in HTMLElement.prototype)) {
      (HTMLElement.prototype as unknown as { hidePopover: () => void }).hidePopover =
        function hidePopover(this: HTMLElement) {
          this.removeAttribute("data-popover-open");
        };
    }
  }

  if (typeof globalThis.CSS === "undefined") {
    (globalThis as unknown as { CSS: { escape: (value: string) => string; supports: () => boolean } }).CSS = {
      escape: (value: string) => String(value).replace(/([^\w-])/g, "\\$1"),
      supports: () => false,
    };
  } else {
    if (typeof globalThis.CSS.escape !== "function") {
      globalThis.CSS.escape = (value: string) => String(value).replace(/([^\w-])/g, "\\$1");
    }
    if (typeof globalThis.CSS.supports !== "function") {
      globalThis.CSS.supports = () => false;
    }
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

if (typeof globalThis !== "undefined" && !(globalThis as any).DOMMatrixReadOnly) {
  (globalThis as any).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: string | number[]) {
      if (typeof init === "string") {
        const match = init.match(/translateY\(([-\d.]+)/);
        if (match) this.f = Number(match[1]) || 0;
      }
    }
  };
}
