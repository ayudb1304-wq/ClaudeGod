import { strings } from '@/shared/strings';
import { PromptLibrary } from './PromptLibrary';
import { LicenseSection } from './LicenseSection';
import { SettingsSection } from './SettingsSection';
import { Onboarding, isOnboardingComplete } from './Onboarding';
import { useEffect, useState } from 'preact/hooks';

/**
 * Settings page. Hosts the prompt library (M4); the remaining controls
 * (shortcuts, widget, alert threshold, pause sync, delete-all-data, license)
 * land in M5 per FEATURES 8.1.
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
    <main
      style={{
        maxWidth: 640,
        margin: '40px auto',
        padding: '0 20px',
        font: '14px/1.6 ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{strings.options.title}</h1>

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
      <p style={{ marginTop: 24, fontSize: 12, color: '#888' }}>{strings.disclaimer}</p>
    </main>
  );
}
