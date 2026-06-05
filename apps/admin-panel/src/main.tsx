import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AppRouter } from "@/app/AppRouter";
import { dismissAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { GlobalIconButtonTooltip } from "@code-proxy/ui";
import "@/styles/index.css";
import "goey-toast/styles.css";
import "@code-proxy/i18n";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <GlobalIconButtonTooltip />
      <AppRouter />
    </HashRouter>
  </StrictMode>,
);

dismissAppLoader();
