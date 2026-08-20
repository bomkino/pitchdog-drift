/// <reference types="vite/client" />

declare module "*.wav?no-inline" {
  const source: string;
  export default source;
}
