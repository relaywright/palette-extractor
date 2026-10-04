import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HowPage from "./HowPage";
import "../index.css";
import "./how.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HowPage />
  </StrictMode>,
);
