import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { setup as setupSatin } from "satin-ui";
import { AppRouter } from "@/app/AppRouter";
import { dismissAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { installChunkLoadRecoveryHandlers } from "@pages/chunkLoadRecovery";
import { GlobalIconButtonTooltip } from "@code-proxy/ui";
import "@/styles/index.css";
import "@code-proxy/i18n";

// 启用 Satin 页面级全局交互（Tooltip、浮层栈、Lightbox 键盘与表单增强）。
setupSatin();
// Catch unhandled dynamic-import failures after deploy (stale hashed chunks).
installChunkLoadRecoveryHandlers();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename="/manage">
      <GlobalIconButtonTooltip />
      <AppRouter />
    </BrowserRouter>
  </StrictMode>,
);

dismissAppLoader(true);
