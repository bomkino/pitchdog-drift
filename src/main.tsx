import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { NativeFileInputBridge } from "./components/NativeFileInputBridge";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <NativeFileInputBridge />
  </StrictMode>,
);
