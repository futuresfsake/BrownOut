import "@fontsource-variable/archivo";
import "@fontsource-variable/source-serif-4";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("the page has no #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
