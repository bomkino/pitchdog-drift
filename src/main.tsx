import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { NativeFileInputBridge } from "./components/NativeFileInputBridge";
import { driftBuildIdentity } from "./lib/buildIdentity";
import "./styles.css";

document.documentElement.dataset.driftBuildChannel = driftBuildIdentity.channel;
document.documentElement.dataset.driftStorageNamespace = driftBuildIdentity.databaseName;
document.title = `${driftBuildIdentity.displayName} — pitch.dog`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <NativeFileInputBridge />
  </StrictMode>,
);
