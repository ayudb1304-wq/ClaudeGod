import { useEffect, useState } from 'preact/hooks';
import { buildUpgradeUrl, type UpgradeSource } from './upgrade';
import { dismissCta, readSettings } from './settings';
import { strings } from './strings';

/**
 * A contextual upgrade CTA with enough weight to be read (FEATURES 7.1).
 *
 * `UpgradeLink` is the quiet form — a sentence in a footer. This is the louder
 * one, for a place where the gate is the whole answer to what the user just
 * asked for: an accent-tinted card explaining what Pro unlocks.
 *
 * Louder buys an obligation: it must be dismissible, and the dismissal must
 * stick. Anything that reappears after being waved away is a nag, which 7.1
 * rules out. Dismissals live in settings, keyed by source, so waving away the
 * export CTA says nothing about the folders one.
 *
 * Renders nothing when no checkout URL is configured, so a half-configured
 * build shows no dead ends.
 */
export function UpgradeCallout({ source, message }: { source: UpgradeSource; message: string }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    readSettings()
      .then((settings) => setDismissed(settings.dismissedCtas.includes(source)))
      // Never seen it dismissed is the safe read: showing a CTA once too often
      // beats silently swallowing the only explanation of a locked feature.
      .catch(() => setDismissed(false));
  }, [source]);

  const url = buildUpgradeUrl(source);
  // `null` means we have not read settings yet — render nothing rather than
  // flashing a card that is about to disappear.
  if (!url || dismissed !== false) return null;

  return (
    <aside class="cg-callout">
      <div class="cg-callout-body">
        <strong class="cg-callout-title">{strings.upgrade.proBadge}</strong>
        <p class="cg-callout-text">{message}</p>
      </div>
      <div class="cg-callout-actions">
        <a href={url} target="_blank" rel="noreferrer noopener" class="cg-callout-cta">
          {strings.upgrade.link}
        </a>
        <button
          type="button"
          class="cg-callout-dismiss"
          aria-label={strings.upgrade.dismiss}
          title={strings.upgrade.dismiss}
          onClick={() => {
            // Optimistic: the card goes now, the write catches up. A failed
            // write means it returns next time, which is the harmless direction.
            setDismissed(true);
            void dismissCta(source);
          }}
        >
          ✕
        </button>
      </div>
    </aside>
  );
}
