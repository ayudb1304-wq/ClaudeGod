/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" enables the dev-hooks postMessage bridge (content/devHooks.ts). */
  readonly VITE_DEV_HOOKS?: string;
  /** "test" points the license client at Dodo test mode. Defaults to live. */
  readonly VITE_DODO_ENV?: string;
  /**
   * Dodo product id (pdt_…) for the upgrade CTA. Public, not a secret.
   * The checkout host is derived from VITE_DODO_ENV, so this is an id and
   * never a full URL.
   */
  readonly VITE_DODO_PRODUCT_ID?: string;
  /** One-question uninstall feedback form on the landing domain. */
  readonly VITE_UNINSTALL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
