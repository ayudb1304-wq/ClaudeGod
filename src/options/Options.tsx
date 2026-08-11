import { useEffect, useState } from 'preact/hooks';
import { strings } from '@/shared/strings';
import { PromptLibrary } from './PromptLibrary';
import { LicenseSection } from './LicenseSection';
import { SettingsSection } from './SettingsSection';
import { Onboarding, isOnboardingComplete } from './Onboarding';

/**
 * Settings page.
 *
 * Sections are cards on a neutral page rather than one long column, because
 * this page now carries four unrelated jobs (onboarding, prompts, preferences,
 * licence) and they need visible separation to stay scannable.
 */
export function Options() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    isOnboardingComplete()
      .then((done) => {
        setShowOnboarding(!done);
      })
      .catch(() => setShowOnboarding(true));
  }, []);

  return (
    <main class="cg-root cg-page">
      <header class="cg-page-head">
        <span class="cg-mark-dot" aria-hidden="true" />
        <div>
          <h1 class="cg-page-title">{strings.options.title}</h1>
          <p class="cg-hint">{strings.options.lede}</p>
        </div>
      </header>

      {showOnboarding && (
        <Onboarding
          onDone={() => {
            setShowOnboarding(false);
          }}
        />
      )}

      <PromptLibrary />
      <SettingsSection />
      <LicenseSection />

      <p class="cg-faint">{strings.disclaimer}</p>
    </main>
  );
}
