import { buildUpgradeUrl, type UpgradeSource } from './upgrade';
import { strings } from './strings';

/**
 * The one upgrade CTA, shared by popup, options and the content-script panels.
 *
 * FEATURES 7.1: contextual and quiet. A footer line or an inline sentence,
 * never a modal, never anything that interrupts typing. It renders nothing at
 * all when no checkout URL is configured, so a half-configured build shows a
 * plain limit message instead of a dead link.
 */
export function UpgradeLink({
  source,
  label = strings.upgrade.link,
}: {
  source: UpgradeSource;
  label?: string;
}) {
  const url = buildUpgradeUrl(source);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      class="cg-accent-link"
    >
      {label}
    </a>
  );
}
