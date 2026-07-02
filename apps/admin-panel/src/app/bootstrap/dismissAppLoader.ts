import { createPortal } from "react-dom";

/** DOM element used for both the HTML pre-hydration loader and the React portal target. */
export const APP_LOADER_ID = "app-loader" as const;

function getAppLoader(): HTMLElement | null {
  return document.getElementById(APP_LOADER_ID);
}

/** Removes the HTML pre-hydration loader with a fade-out transition.
 *
 * Call this once after React has mounted. If the caller passes `true` for
 * `expectReactLoader`, the HTML loader is NOT removed — instead it is left
 * in the DOM so the React `PageLoader` can portal into it (used during
 * auth restoration to avoid a flicker of an empty screen).
 *
 * When `expectReactLoader=false` (the default), the HTML loader is always
 * dismissed regardless of any other state.
 *
 * Returns `true` if the HTML loader was removed, `false` if it was left
 * in place for the React portal.
 */
export function dismissAppLoader(expectReactLoader = false): boolean {
  const loader = getAppLoader();
  if (!loader) return true;

  if (expectReactLoader) {
    // Leave the HTML element in place; React will portal into it.
    return false;
  }

  loader.classList.add("fade-out");
  loader.addEventListener("transitionend", () => loader.remove(), { once: true });
  setTimeout(() => loader.remove(), 500);
  return true;
}

/** Portals a React node into the #app-loader element, replacing its contents.
 * Must be called only after the #app-loader element exists in the DOM.
 */
export function portalIntoAppLoader(node: React.ReactNode): React.ReactPortal | null {
  const loader = getAppLoader();
  if (!loader) return null;
  return createPortal(node, loader);
}
