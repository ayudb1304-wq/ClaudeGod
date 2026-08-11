import { APP_NAME } from './strings';

/**
 * The product logo, for the extension's own pages.
 *
 * Reads the same asset the manifest ships as the toolbar and store icon, so
 * there is one logo file and it can never drift from what the browser shows.
 *
 * Deliberately not used on the content-script surfaces. The widget and banner
 * carry 7px status dots, and a logo rendered that small is mush; those dots
 * mark state, not brand.
 */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <img
      class="cg-brand-mark"
      src={chrome.runtime.getURL('icons/icon-128.png')}
      width={size}
      height={size}
      alt=""
      /* Decorative: the product name sits next to it in text, so announcing
         the image too would just repeat it for screen readers. */
      aria-hidden="true"
      title={APP_NAME}
    />
  );
}
