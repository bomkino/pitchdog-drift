/// <reference types="vite/client" />

declare module "*.wav?inline" {
  const source: string;
  export default source;
}
