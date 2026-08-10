/**
 * Inserting a prompt into Claude's composer (FEATURES 5.1).
 *
 * This is the finicky part of the milestone. Claude's composer is a rich-text
 * editor (contenteditable), and setting `textContent` on one of those produces
 * text the user can see but the app has never heard of — it sends an empty
 * message. So insertion goes through `execCommand('insertText')`, which raises
 * the same `beforeinput`/`input` events a keystroke would and therefore updates
 * the editor's own model.
 *
 * Never auto-sends: no Enter is dispatched, no form submitted (hard rule 1).
 */

export type Editable = HTMLElement;

export function isEditable(node: unknown): node is Editable {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  return node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement;
}

/** The composer's current plain text, whichever kind of field it is. */
export function readEditableText(element: Editable): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }
  return element.textContent ?? '';
}

/** Single line, starting with a slash, with nothing before it. */
const SLASH_QUERY = /^\/([^\n]*)$/;

/**
 * The query typed after a leading `/`, or null when the composer holds anything
 * else.
 *
 * Requiring the slash to be the entire content is the deliberate narrow reading
 * of "typing / at the start of the input" (FEATURES 5.1): it never fires
 * mid-sentence or inside pasted code, and it lets insertion replace the whole
 * field instead of doing caret arithmetic in an editor we do not own.
 */
export function readSlashQuery(text: string): string | null {
  return SLASH_QUERY.exec(text.trimStart())?.[1] ?? null;
}

function selectAllOf(element: Editable): void {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.setSelectionRange(0, element.value.length);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Replaces the composer's entire contents with `text`.
 *
 * Replacing everything is safe because the picker only opens when the composer
 * holds nothing but the `/query` that triggered it — there is no user text to
 * lose, and it means no caret arithmetic against an editor we do not own.
 *
 * Returns false when the editor refused the insert, so the caller can leave the
 * typed text alone rather than pretending it worked.
 */
export function insertPrompt(element: Editable, text: string): boolean {
  element.focus();
  selectAllOf(element);

  // Deprecated, but still the only API that speaks to a contenteditable editor
  // through the same path as a keystroke. The Input Events spec has no
  // programmatic equivalent.
  const inserted = document.execCommand('insertText', false, text);
  if (inserted) return true;

  // Plain fields have a working fallback: set the value through the native
  // setter (so frameworks watching the property see it) and announce it.
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with .call below
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  return false;
}
