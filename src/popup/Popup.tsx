import { useEffect, useState } from 'preact/hooks';
import { formatDuration, formatTimeUntil, readCachedUsage, type UsageSnapshot } from '@/core/usage';
import { strings } from '@/shared/strings';

/**
 * Toolbar popup (FEATURES 3.1): displays the cached usage snapshot.
 *
 * Display only. The popup never fetches claude.ai — the content script owns the
 * session and keeps the cache fresh; we show what we have, honestly dated.
 */

type PopupUsageState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ok'; snapshot: UsageSnapshot };

function UsageRow({ label, utilization }: { label: string; utilization: number }) {
  const color = utilization >= 90 ? '#c65f45' : utilization >= 75 ? '#b3862e' : '#4a69bd';
  return (
    <div style={{ margin: '8px 0 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span>{utilization}%</span>
      </div>
      <div style={{ marginTop: 3, height: 5, borderRadius: 3, background: '#e8e8e8', overflow: 'hidden' }}>
        <div style={{ width: `${String(utilization)}%`, height: '100%', borderRadius: 3, background: color }} />
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

export function Popup() {
  return (
    <main style={{ width: 280, padding: 16, font: '13px/1.5 ui-sans-serif, system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 15 }}>{strings.popup.title}</h1>
      <UsageSection />
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
