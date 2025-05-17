import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@oh-just-another/react-ui/styles.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
