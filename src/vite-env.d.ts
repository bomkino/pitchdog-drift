/// <reference types="vite/client" />

declare module "*.ogg?inline" {
  const dataUri: string;
  export default dataUri;
}
