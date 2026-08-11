import { useEffect, useState } from 'preact/hooks';
import {
  classifyUsageFreshness,
  formatDuration,
  formatTimeUntil,
  readCachedUsage,
  type UsageSnapshot,
} from '@/core/usage';
import { loadFolders, subscribeFolders, type Folder } from '@/core/folders';
import { getConversationTitles } from '@/core/db';
import { getEntitlements, subscribeEntitlements } from '@/core/entitlements';
import { createDexieExportSource, exportConversationsZip } from '@/core/exporter';
import { conversationWebUrl } from '@/api/claudeAdapter';
import { downloadFile } from '@/shared/download';
import { strings } from '@/shared/strings';
import { UpgradeLink } from '@/shared/UpgradeLink';
import { BrandMark } from '@/shared/BrandMark';
import { IndexingSection } from './IndexingSection';

/**
 * Toolbar popup (FEATURES 3.1).
 *
 * Display only. It never fetches claude.ai: the content script owns the session
 * and keeps the cache fresh, so we show what we have, honestly dated.
 *
 * Usage is the hero. The reason someone clicks this icon mid-task is to answer
 * "how much have I got left", and that should need no reading.
 */

type PopupUsageState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ok'; snapshot: UsageSnapshot };

function level(utilization: number): 'ok' | 'warn' | 'danger' {
  if (utilization >= 90) return 'danger';
  if (utilization >= 75) return 'warn';
  return 'ok';
}

function Meter({ label, utilization }: { label: string; utilization: number }) {
  return (
    <div class="cg-meter-row">
      <div class="cg-meter-head">
        <span>{label}</span>
        <b>{utilization}%</b>
      </div>
      <div
        class="cg-meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={utilization}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          class="cg-meter-fill"
          data-level={level(utilization)}
          style={{ width: `${String(Math.min(100, Math.max(0, utilization)))}%` }}
        />
      </div>
    </div>
  );
}

function UsageSection() {
  const [state, setState] = useState<PopupUsageState>({ kind: 'loading' });

  useEffect(() => {
    readCachedUsage()
      .then((snapshot) => {
        setState(snapshot ? { kind: 'ok', snapshot } : { kind: 'empty' });
      })
      .catch(() => setState({ kind: 'empty' }));
  }, []);

  if (state.kind === 'loading') {
    return <p class="cg-notice">{strings.usage.popupLoading}</p>;
  }
  if (state.kind === 'empty') {
    return <p class="cg-notice">{strings.usage.popupEmpty}</p>;
  }

  const { snapshot } = state;
  const now = new Date();
  const freshness = classifyUsageFreshness(snapshot, now);
  const reset = formatTimeUntil(snapshot.fiveHour?.resetsAt ?? null, now);
  const ageMs = now.getTime() - Date.parse(snapshot.fetchedAt);

  /*
   * Expired means the 5-hour window rolled over since we last measured, so the
   * stored percentage describes a window that no longer exists. Showing it,
   * even dimmed, would be stating something false with a number attached.
   */
  if (freshness === 'expired') {
    return (
      <section class="cg-section">
        <h2 class="cg-section-title">{strings.usage.sectionTitle}</h2>
        <p class="cg-notice">{strings.usage.windowReset}</p>
        <p class="cg-faint">{strings.usage.openClaudeToRefresh}</p>
      </section>
    );
  }

  return (
    <section class="cg-section">
      <h2 class="cg-section-title">{strings.usage.sectionTitle}</h2>

      {snapshot.fiveHour && (
        <div class="cg-usage-hero" data-stale={String(freshness === 'stale')}>
          <span class="cg-usage-value">{snapshot.fiveHour.utilization}%</span>
          <span class="cg-usage-label">
            {reset ? strings.usage.resetsIn(reset) : strings.usage.session}
          </span>
        </div>
      )}

      {snapshot.fiveHour && (
        <Meter label={strings.usage.session} utilization={snapshot.fiveHour.utilization} />
      )}
      {snapshot.sevenDay && (
        <Meter label={strings.usage.week} utilization={snapshot.sevenDay.utilization} />
      )}

      {freshness === 'stale' ? (
        // Old enough to mislead, so the caveat is louder than a timestamp.
        <p class="cg-notice" data-tone="warn">
          {strings.usage.stale(formatDuration(ageMs))}
        </p>
      ) : (
        Number.isFinite(ageMs) &&
        ageMs >= 0 && <p class="cg-notice">{strings.usage.updatedAgo(formatDuration(ageMs))}</p>
      )}
    </section>
  );
}

/**
 * Folder list (FEATURES 4.1).
 *
 * Also the required fallback: if the panel cannot mount on claude.ai, folders
 * stay readable and their chats openable from here.
 */
function FoldersSection() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const unsubscribe = subscribeFolders((next) => {
      setFolders(next);
      getConversationTitles([...new Set(next.flatMap((folder) => folder.convIds))])
        .then(setTitles)
        .catch(() => setTitles(new Map()));
    });
    void loadFolders();
    return unsubscribe;
  }, []);

  return (
    <section class="cg-section">
      <h2 class="cg-section-title">{strings.folders.title}</h2>

      {folders.length === 0 ? (
        <p class="cg-notice">{strings.folders.empty}</p>
      ) : (
        <ul class="cg-list">
          {folders.map((folder) => (
            <li key={folder.id}>
              <div class="cg-list-row">
                <span class="cg-dot" style={{ background: folder.color }} />
                <span class="cg-grow">{folder.name}</span>
                <span class="cg-faint">{strings.folders.count(folder.convIds.length)}</span>
              </div>
              <ul class="cg-list" style={{ paddingLeft: 16 }}>
                {folder.convIds.slice(0, 4).map((convUuid) => (
                  <li key={convUuid} class="cg-list-row">
                    <a
                      class="cg-link"
                      href={conversationWebUrl(convUuid)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {titles.get(convUuid) ?? strings.folders.unknownChat}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Bulk export of everything mirrored locally (FEATURES 6.2, Pro). */
function ExportSection() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Entitlements hydrate asynchronously from storage, so reading them once at
  // first render would leave a paying customer looking at the free-tier CTA.
  const [canExport, setCanExport] = useState(getEntitlements().bulkExport);

  useEffect(() => subscribeEntitlements((value) => setCanExport(value.bulkExport)), []);

  async function exportAll(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const uuids = await createDexieExportSource().listConversationUuids();
      if (uuids.length === 0) {
        setStatus(strings.exportUi.empty);
        return;
      }
      const file = await exportConversationsZip(uuids, {
        onProgress: (done, total) => {
          setStatus(strings.exportUi.working(done, total));
        },
      });
      downloadFile(file);
      setStatus(null);
    } catch {
      setStatus(strings.exportUi.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!canExport) {
    // Quiet contextual CTA, never a modal (FEATURES 7.1).
    return (
      <p class="cg-notice">
        {strings.exportUi.proOnly} <UpgradeLink source="bulk-export" />
      </p>
    );
  }

  return (
    <div class="cg-actions">
      <button
        type="button"
        class="cg-btn"
        disabled={busy}
        onClick={() => {
          void exportAll();
        }}
      >
        {strings.exportUi.all}
      </button>
      {status && <span class="cg-notice">{status}</span>}
    </div>
  );
}

export function Popup() {
  const [isPro, setIsPro] = useState(getEntitlements().isPro);
  useEffect(() => subscribeEntitlements((value) => setIsPro(value.isPro)), []);

  return (
    <main class="cg-root cg-popup">
      <header class="cg-brand">
        <BrandMark size={18} />
        <span class="cg-brand-name">{strings.popup.title}</span>
        {isPro && <span class="cg-badge">{strings.popup.proBadge}</span>}
      </header>

      <div class="cg-body">
        <UsageSection />
        <hr class="cg-divider" />
        <IndexingSection />
        <hr class="cg-divider" />
        <FoldersSection />
        <ExportSection />

        <div class="cg-actions">
          <button
            type="button"
            class="cg-btn"
            onClick={() => void chrome.runtime.openOptionsPage()}
          >
            {strings.popup.openSettings}
          </button>
        </div>
      </div>

      <p class="cg-footnote">{strings.disclaimer}</p>
    </main>
  );
}
