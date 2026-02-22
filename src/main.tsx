import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AppRouter } from "@/app/AppRouter";
import "@/styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("根节点 #root 不存在");
}

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <AppRouter />
    </HashRouter>
  </StrictMode>,
);
