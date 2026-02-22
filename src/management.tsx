import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/global.scss";
import { INLINE_LOGO_JPEG } from "@/assets/logoInline";
import App from "@/App";

document.title = "CLI Proxy API Management Center";

const faviconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (faviconEl) {
  faviconEl.href = INLINE_LOGO_JPEG;
  faviconEl.type = "image/jpeg";
} else {
  const newFavicon = document.createElement("link");
  newFavicon.rel = "icon";
  newFavicon.type = "image/jpeg";
  newFavicon.href = INLINE_LOGO_JPEG;
  document.head.appendChild(newFavicon);
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("根节点 #root 不存在");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
