/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" enables the dev-hooks postMessage bridge (content/devHooks.ts). */
  readonly VITE_DEV_HOOKS?: string;
  /** "test" points the license client at Dodo test mode. Defaults to live. */
  readonly VITE_DODO_ENV?: string;
  /** Hosted Dodo checkout link for the upgrade CTA. Public, not a secret. */
  readonly VITE_DODO_CHECKOUT_URL?: string;
  /** One-question uninstall feedback form on the landing domain. */
  readonly VITE_UNINSTALL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
