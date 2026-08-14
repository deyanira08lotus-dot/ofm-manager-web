import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "@/lib/pwa";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: registro del service worker (solo en producción)
if (import.meta.env.PROD) {
  window.addEventListener("load", registerServiceWorker);
}
