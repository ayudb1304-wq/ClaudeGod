import { strings } from '@/shared/strings';

/**
 * Toolbar popup. M0 scaffold only: proves the Preact/CRXJS pipeline boots.
 * Real contents (usage meter, folder quick view, search entry) land in M3/M4.
 */
export function Popup() {
  return (
    <main style={{ width: 280, padding: 16, font: '13px/1.5 ui-sans-serif, system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 15 }}>{strings.popup.title}</h1>
      <p style={{ margin: '0 0 12px', color: '#555' }}>{strings.popup.scaffoldNotice}</p>
      <button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
        {strings.popup.openSettings}
      </button>
      <p style={{ margin: '12px 0 0', fontSize: 11, color: '#888' }}>{strings.disclaimer}</p>
    </main>
  );
}
