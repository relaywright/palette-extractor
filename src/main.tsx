import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registered a few seconds after load so the worker's first download (it
// caches the whole app) never competes with the page's own, such as the
// color stage. Development builds skip it: a cached shell would hide edits.
const REGISTER_DELAY_MS = 4000;
if (import.meta.env.PROD && "serviceWorker" in navigator)
  addEventListener("load", () =>
    setTimeout(
      () => import("./lib/sw-register").then((m) => m.registerServiceWorker()),
      REGISTER_DELAY_MS,
    ),
  );
