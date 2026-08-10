/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" enables the dev-hooks postMessage bridge (content/devHooks.ts). */
  readonly VITE_DEV_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
