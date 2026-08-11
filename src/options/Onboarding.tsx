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
    <section class="cg-card">
      <div class="cg-actions">
        <div class="cg-steps" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} class="cg-step" data-on={String(i <= step)} />
          ))}
        </div>
        <span class="cg-faint">{strings.onboarding.stepCounter(step + 1, STEP_COUNT)}</span>
      </div>
      <h2 class="cg-card-title">{content?.title}</h2>
      <p class="cg-card-lede">{content?.body}</p>

      {step === 1 && (
        <ul class="cg-muted" style={{ margin: 0, paddingLeft: 18 }}>
          {strings.onboarding.privacyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}

      {problem && <p class="cg-notice" data-tone="warn">{problem}</p>}

      <div class="cg-actions">
        {step > 0 && (
          <button type="button" class="cg-btn"
            disabled={busy}
            onClick={() => {
              setStep((i) => i - 1);
            }}
          >
            {strings.onboarding.back}
          </button>
        )}

        {step < STEP_COUNT - 1 ? (
          <button type="button" class="cg-btn"
            onClick={() => {
              setStep((i) => i + 1);
            }}
          >
            {strings.onboarding.next}
          </button>
        ) : (
          <>
            <button
              type="button"
              class="cg-btn cg-btn-primary"
              disabled={busy}
              onClick={() => void finish(true)}
            >
              {busy ? strings.onboarding.starting : strings.onboarding.startIndexing}
            </button>
            {/* Declining is a first-class outcome, not a hidden link. The
                extension still works: folders, prompts and the usage meter
                need no index at all. */}
            <button type="button" class="cg-btn" disabled={busy} onClick={() => void finish(false)}>
              {strings.onboarding.skip}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
