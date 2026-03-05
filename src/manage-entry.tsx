import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/app/AppRouter";
import "@/styles/index.css";
import "goey-toast/styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
    throw new Error("根节点 #root 不存在");
}

createRoot(rootElement).render(
    <StrictMode>
        <BrowserRouter basename="/manage">
            <AppRouter />
        </BrowserRouter>
    </StrictMode>,
);
