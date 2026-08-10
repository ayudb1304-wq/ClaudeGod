/**
 * Keeps typing inside our shadow hosts from reaching Claude's page handlers.
 *
 * Claude's app redirects loose keystrokes into its composer. Shadow retargeting
 * makes an input of ours look like a plain `<div>` to their document-level
 * listener, so their redirect wins: the characters land in the composer, and an
 * Enter meant for our form sends a message. Observed twice — in the M2 search
 * overlay, and again in the M4 folder panel, where it sent a real message to a
 * real account before the guard was added here.
 *
 * Stopping these events at the host boundary means page-level listeners never
 * see typing that belongs to us. Events originating in Claude's own DOM are
 * untouched: this only fires for events whose path starts inside our host, so
 * the slash picker still sees composer keystrokes.
 */
const SHIELDED_EVENTS = ['keydown', 'keyup', 'keypress', 'beforeinput', 'input'] as const;

export function shieldKeyboardEvents(host: HTMLElement): void {
  for (const type of SHIELDED_EVENTS) {
    host.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  }
}
