/// <reference types="vite/client" />

import type { LinuxDesktopBridge } from "./lib/linuxElectron";

declare global {
  interface Window {
    readonly __DRIFT_LINUX_DESKTOP__?: LinuxDesktopBridge;
  }
}

export {};

declare module "*.wav.b64?raw" {
  const source: string;
  export default source;
}
