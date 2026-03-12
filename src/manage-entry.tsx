import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/app/AppRouter";
import "@/styles/index.css";
import "goey-toast/styles.css";
import "@/i18n/index";
import { useTranslation } from "react-i18next";


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
