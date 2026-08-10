import { strings } from '@/shared/strings';

/**
 * Settings page. M0 scaffold only. Real controls (shortcuts, widget, alert
 * threshold, pause sync, delete-all-data, license) land in M5 per FEATURES 8.1.
 */
export function Options() {
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
      <p style={{ color: '#555' }}>{strings.options.scaffoldNotice}</p>
      <p style={{ marginTop: 24, fontSize: 12, color: '#888' }}>{strings.disclaimer}</p>
    </main>
  );
}
