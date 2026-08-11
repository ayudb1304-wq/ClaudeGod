import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getLocal, setLocal } from '@/shared/storage';
import { strings } from '@/shared/strings';
import { readSettings } from '@/shared/settings';
import type { SyncStateReply } from '@/shared/messages';
import { SyncClientFailure, requestStartSync, requestSyncState } from './syncClient';

/**
 * Indexing controls (FEATURES 7.2 consent + 8.1 data controls).
 *
 * Indexing is opt-in and stays opt-in: the button is the ONLY thing in the
 * extension that starts a backfill. Nothing indexes on install, and nothing
 * indexes in the background.
 */

const POLL_INTERVAL_MS = 800;

type Phase = 'checking' | 'needs-consent' | 'idle' | 'running' | 'unavailable';

function explainFailure(reason: SyncClientFailure['reason']): string {
  return reason === 'no-claude-tab'
    ? strings.indexing.needsClaudeTab
    : strings.indexing.needsReload;
}

export function IndexingSection() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, setState] = useState<SyncStateReply | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    readSettings()
      .then((settings) => {
        setPaused(settings.syncPaused);
      })
      .catch(() => setPaused(false));
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    try {
      const reply = await requestSyncState();
      setState(reply);
      setProblem(null);
      setPhase(reply.running ? 'running' : 'idle');
    } catch (error) {
      if (error instanceof SyncClientFailure) {
        setProblem(explainFailure(error.reason));
        setPhase('unavailable');
      } else {
        setProblem(strings.indexing.failed);
        setPhase('unavailable');
      }
    }
  }, []);

  // Consent is checked before anything else: an un-consented user should never
  // see a progress readout implying we already read their account.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const consented = await getLocal<boolean>('syncConsent');
      if (cancelled) return;
      if (consented !== true) {
        setPhase('needs-consent');
        return;
      }
      await poll();
    })();
    return () => {
      cancelled = true;
    };
  }, [poll]);

  // Poll only while a run is in flight. A popup that polls forever keeps the
  // content script busy for no reason.
  useEffect(() => {
    if (phase !== 'running') return;
    timer.current = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [phase, poll]);

  const start = useCallback(async (): Promise<void> => {
    setProblem(null);
    try {
      await setLocal('syncConsent', true);
      const reply = await requestStartSync();
      setState(reply);
      setPhase('running');
    } catch (error) {
      if (error instanceof SyncClientFailure) {
        setProblem(explainFailure(error.reason));
        setPhase('unavailable');
      } else {
        setProblem(strings.indexing.failed);
        setPhase('unavailable');
      }
    }
  }, []);

  const indexed = state?.indexedConversations ?? 0;
  const degraded = state?.status.kind === 'degraded';

  // Without this the button would appear to work and quietly do nothing, since
  // startSync rejects on a paused setting inside the content script.
  if (paused) {
    return (
      <section class="cg-section">
        <h2 class="cg-section-title">{strings.indexing.title}</h2>
        <p class="cg-notice">
          {indexed > 0 ? strings.indexing.indexed(indexed) : strings.indexing.nothingYet}
        </p>
        <p class="cg-notice" data-tone="warn">
          {strings.indexing.pausedNote}
        </p>
      </section>
    );
  }

  return (
    <section class="cg-section">
      <h2 class="cg-section-title">{strings.indexing.title}</h2>

      {phase === 'checking' && (
        <p class="cg-notice">
          {strings.indexing.checking}
        </p>
      )}

      {phase === 'needs-consent' && (
        <>
          <p class="cg-notice">
            {strings.indexing.consentExplainer}
          </p>
          <ul class="cg-muted" style={{ margin: 0, paddingLeft: 18 }}>
            {strings.indexing.consentPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      )}

      {phase === 'running' && (
        <p class="cg-notice">
          {strings.indexing.running(state?.status.progress?.indexed ?? indexed)}
        </p>
      )}

      {phase === 'idle' && (
        <p class="cg-notice">
          {indexed > 0 ? strings.indexing.indexed(indexed) : strings.indexing.nothingYet}
        </p>
      )}

      {degraded && (
        <p class="cg-notice" data-tone="warn">
          {strings.sync.degraded}
        </p>
      )}

      {problem && (
        <p class="cg-notice" data-tone="warn">
          {problem}
        </p>
      )}

      {phase !== 'checking' && (
        <button
          type="button"
          class={phase === 'needs-consent' ? 'cg-btn cg-btn-primary' : 'cg-btn'}
          disabled={phase === 'running'}
          onClick={() => void start()}
        >
          {phase === 'running'
            ? strings.indexing.buttonRunning
            : phase === 'needs-consent'
              ? strings.indexing.buttonStart
              : strings.indexing.buttonUpdate}
        </button>
      )}

      {phase === 'running' && (
        <p class="cg-faint">
          {strings.indexing.keepTabOpen}
        </p>
      )}
    </section>
  );
}
