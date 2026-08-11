import { useCallback, useState } from 'preact/hooks';
import { getLocal, setLocal } from '@/shared/storage';
import { strings } from '@/shared/strings';
import { SyncClientFailure, requestStartSync } from '@/popup/syncClient';

/**
 * First-run explainer (FEATURES 7.2).
 *
 * Three steps: what it does, where the data lives, then consent. Indexing is
 * opt-in and starts only from the button on step 3, so nothing has been read
 * from the account while this is on screen.
 *
 * Step 2 is not filler. The whole product promise is local-first (PRD §4), and
 * a user who does not believe that has no reason to let us read their history.
 */

export interface OnboardingRecord {
  completed: boolean;
}

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const stored = await getLocal<OnboardingRecord>('onboarding');
    return stored?.completed === true;
  } catch {
    // If we cannot tell, show it. A repeated explainer is a small annoyance;
    // silently skipping consent is not.
    return false;
  }
}

const STEP_COUNT = 3;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const finish = useCallback(
    async (startIndexing: boolean): Promise<void> => {
      setBusy(true);
      setProblem(null);
      try {
        if (startIndexing) {
          // Consent is recorded by the same click that starts the work, so the
          // two can never disagree.
          await setLocal('syncConsent', true);
          // Opens a background claude.ai tab if none is usable, so a first-run
          // user with no Claude tab open is not sent away to fix it themselves.
          await requestStartSync();
        }
        await setLocal('onboarding', { completed: true } satisfies OnboardingRecord);
        onDone();
      } catch (error) {
        if (error instanceof SyncClientFailure) {
          setProblem(
            error.reason === 'no-claude-tab'
              ? strings.indexing.needsClaudeTab
              : strings.indexing.needsReload,
          );
        } else {
          setProblem(strings.indexing.failed);
        }
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const content = [
    { title: strings.onboarding.step1Title, body: strings.onboarding.step1Body },
    { title: strings.onboarding.step2Title, body: strings.onboarding.step2Body },
    { title: strings.onboarding.step3Title, body: strings.onboarding.step3Body },
  ][step];

  return (
    <section
      style={{
        border: '1px solid #e2e2e2',
        borderRadius: 10,
        padding: '20px 22px',
        margin: '0 0 28px',
        background: '#fbfbfb',
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
        {strings.onboarding.stepCounter(step + 1, STEP_COUNT)}
      </p>
      <h2 style={{ margin: '4px 0 8px', fontSize: 17 }}>{content?.title}</h2>
      <p style={{ margin: 0, color: '#444' }}>{content?.body}</p>

      {step === 1 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: '#444' }}>
          {strings.onboarding.privacyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}

      {problem && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#a05a2c' }}>{problem}</p>}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        {step > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep((i) => i - 1);
            }}
          >
            {strings.onboarding.back}
          </button>
        )}

        {step < STEP_COUNT - 1 ? (
          <button
            type="button"
            onClick={() => {
              setStep((i) => i + 1);
            }}
          >
            {strings.onboarding.next}
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => void finish(true)}>
              {busy ? strings.onboarding.starting : strings.onboarding.startIndexing}
            </button>
            {/* Declining is a first-class outcome, not a hidden link. The
                extension still works: folders, prompts and the usage meter
                need no index at all. */}
            <button type="button" disabled={busy} onClick={() => void finish(false)}>
              {strings.onboarding.skip}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
