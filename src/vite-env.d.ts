/// <reference types="vite/client" />

declare module "*.wav.b64?raw" {
  const source: string;
  export default source;
}
