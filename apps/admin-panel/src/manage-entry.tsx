import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/app/AppRouter";
import { dismissAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { installChunkLoadRecoveryHandlers } from "@pages/chunkLoadRecovery";
import "@/styles/index.css";
import "goey-toast/styles.css";
import "@code-proxy/i18n";

// Catch unhandled dynamic-import failures after deploy (stale hashed chunks).
installChunkLoadRecoveryHandlers();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename="/manage">
      <AppRouter />
    </BrowserRouter>
  </StrictMode>,
);

dismissAppLoader(true);
