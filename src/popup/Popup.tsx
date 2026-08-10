import { useEffect, useState } from 'preact/hooks';
import { formatDuration, formatTimeUntil, readCachedUsage, type UsageSnapshot } from '@/core/usage';
import { loadFolders, subscribeFolders, type Folder } from '@/core/folders';
import { getConversationTitles } from '@/core/db';
import { getEntitlements } from '@/core/entitlements';
import { createDexieExportSource, exportConversationsZip } from '@/core/exporter';
import { conversationWebUrl } from '@/api/claudeAdapter';
import { downloadFile } from '@/shared/download';
import { strings } from '@/shared/strings';

/**
 * Toolbar popup (FEATURES 3.1): displays the cached usage snapshot.
 *
 * Display only. The popup never fetches claude.ai — the content script owns the
 * session and keeps the cache fresh; we show what we have, honestly dated.
 */

type PopupUsageState =
  { kind: 'loading' } | { kind: 'empty' } | { kind: 'ok'; snapshot: UsageSnapshot };

function UsageRow({ label, utilization }: { label: string; utilization: number }) {
  const color = utilization >= 90 ? '#c65f45' : utilization >= 75 ? '#b3862e' : '#4a69bd';
  return (
    <div style={{ margin: '8px 0 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span>{utilization}%</span>
      </div>
      <div
        style={{
          marginTop: 3,
          height: 5,
          borderRadius: 3,
          background: '#e8e8e8',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${String(utilization)}%`,
            height: '100%',
            borderRadius: 3,
            background: color,
          }}
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
    return <p style={{ margin: 0, color: '#555' }}>{strings.usage.popupLoading}</p>;
  }
  if (state.kind === 'empty') {
    return <p style={{ margin: 0, color: '#555' }}>{strings.usage.popupEmpty}</p>;
  }

  const { snapshot } = state;
  const now = new Date();
  const reset = formatTimeUntil(snapshot.fiveHour?.resetsAt ?? null, now);
  const ageMs = now.getTime() - Date.parse(snapshot.fetchedAt);

  return (
    <section>
      {snapshot.fiveHour && (
        <UsageRow label={strings.usage.session} utilization={snapshot.fiveHour.utilization} />
      )}
      {snapshot.sevenDay && (
        <UsageRow label={strings.usage.week} utilization={snapshot.sevenDay.utilization} />
      )}
      {reset && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#777' }}>
          {strings.usage.resetsIn(reset)}
        </p>
      )}
      {Number.isFinite(ageMs) && ageMs >= 0 && (
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#999' }}>
          {strings.usage.updatedAgo(formatDuration(ageMs))}
        </p>
      )}
    </section>
  );
}

/**
 * Folder list (FEATURES 4.1).
 *
 * This is also the required fallback: if the panel cannot mount on claude.ai
 * for any reason, folders are still readable and their chats still openable
 * from here.
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

  if (folders.length === 0) {
    return (
      <p style={{ margin: '4px 0 0', color: '#666', fontSize: 12 }}>{strings.folders.empty}</p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
      {folders.map((folder) => (
        <li key={folder.id} style={{ margin: '6px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: folder.color }} />
            <span style={{ flex: 1 }}>{folder.name}</span>
            <span style={{ fontSize: 11, color: '#888' }}>
              {strings.folders.count(folder.convIds.length)}
            </span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 0 14px' }}>
            {folder.convIds.slice(0, 5).map((convUuid) => (
              <li key={convUuid}>
                <a
                  href={conversationWebUrl(convUuid)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    color: titles.has(convUuid) ? '#444' : '#999',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {titles.get(convUuid) ?? strings.folders.unknownChat}
                </a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Bulk export of everything mirrored locally (FEATURES 6.2, Pro). */
function ExportSection() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!getEntitlements().bulkExport) {
    // Quiet contextual CTA, never a modal (FEATURES 7.1).
    return (
      <p style={{ margin: '10px 0 0', fontSize: 11, color: '#888' }}>{strings.exportUi.proOnly}</p>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void exportAll();
        }}
      >
        {strings.exportUi.all}
      </button>
      {status && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#666' }}>{status}</p>}
    </div>
  );
}

export function Popup() {
  return (
    <main
      style={{ width: 280, padding: 16, font: '13px/1.5 ui-sans-serif, system-ui, sans-serif' }}
    >
      <h1 style={{ margin: '0 0 8px', fontSize: 15 }}>{strings.popup.title}</h1>
      <UsageSection />

      <h2 style={{ margin: '16px 0 0', fontSize: 13 }}>{strings.folders.title}</h2>
      <FoldersSection />
      <ExportSection />

      <button
        type="button"
        style={{ marginTop: 12 }}
        onClick={() => void chrome.runtime.openOptionsPage()}
      >
        {strings.popup.openSettings}
      </button>
      <p style={{ margin: '12px 0 0', fontSize: 11, color: '#888' }}>{strings.disclaimer}</p>
    </main>
  );
}
