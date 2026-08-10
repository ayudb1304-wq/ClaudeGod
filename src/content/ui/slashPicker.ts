import { h, render } from 'preact';
import { PromptPicker } from './PromptPicker';
import { PICKER_STYLES } from './pickerStyles';
import { shieldKeyboardEvents } from './shieldKeyboard';
import {
  fillVariables,
  filterPrompts,
  getPrompts,
  loadPrompts,
  parseVariables,
  subscribePrompts,
  type Prompt,
} from '@/core/prompts';
import { getEntitlements } from '@/core/entitlements';
import {
  insertPrompt,
  isEditable,
  readEditableText,
  readSlashQuery,
  type Editable,
} from '../promptInsert';
import { subscribeSyncChanges } from '@/shared/storage';
import { strings } from '@/shared/strings';

/**
 * Host for the `/` prompt picker (FEATURES 5.1).
 *
 * Opens when the composer contains nothing but a `/` and what follows it (see
 * `readSlashQuery` for why that reading is deliberately narrow).
 *
 * Keyboard focus never leaves Claude's composer while the list is open — the
 * arrow keys are intercepted at the document level and the picker is painted
 * beside it. That keeps typing (and therefore filtering) working normally.
 */

const HOST_ID = 'claudegod-picker-host';

let mountPoint: HTMLDivElement | null = null;
let editable: Editable | null = null;
let query = '';
let activeIndex = 0;
let variables: { prompt: Prompt; names: string[] } | null = null;
let isOpen = false;

function ensureHost(): HTMLDivElement {
  if (mountPoint) return mountPoint;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483644';
  document.body.appendChild(host);
  // Only shields typing that starts inside the picker (its variable inputs).
  // Composer keystrokes never enter this host, so filtering still works.
  shieldKeyboardEvents(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PICKER_STYLES;
  shadow.appendChild(style);

  const mount = document.createElement('div');
  // Only the picker itself takes clicks; the rest of the layer is inert so the
  // page underneath behaves exactly as it did before we mounted.
  mount.style.cssText = 'pointer-events:auto';
  shadow.appendChild(mount);
  mountPoint = mount;
  return mount;
}

function visiblePrompts(): Prompt[] {
  return filterPrompts(getPrompts(), query);
}

function close(): void {
  if (!isOpen) return;
  isOpen = false;
  variables = null;
  activeIndex = 0;
  if (mountPoint) render(null, mountPoint);
}

function insert(text: string): void {
  const target = editable;
  close();
  // Insertion can fail if Claude's editor refuses the command; leaving the
  // user's typed "/query" in place is the honest outcome.
  if (target) insertPrompt(target, text);
}

function choose(prompt: Prompt): void {
  const names = parseVariables(prompt.body);

  if (names.length > 0 && getEntitlements().promptVariables) {
    variables = { prompt, names };
    paint();
    return;
  }

  // Free tier inserts the body as written, placeholders included.
  insert(prompt.body);
}

function paint(): void {
  if (!isOpen || !editable) return;

  const rect = editable.getBoundingClientRect();
  const prompts = visiblePrompts();
  const entitlements = getEntitlements();
  const showsVariables = prompts.some((prompt) => parseVariables(prompt.body).length > 0);

  render(
    h(PromptPicker, {
      prompts,
      activeIndex: Math.min(activeIndex, Math.max(prompts.length - 1, 0)),
      anchor: {
        left: Math.max(8, rect.left),
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
      },
      variables,
      note: showsVariables && !entitlements.promptVariables ? strings.prompts.variablesPro : null,
      onSelect: choose,
      onHover: (index: number) => {
        activeIndex = index;
        paint();
      },
      onFill: (values: Record<string, string>) => {
        const prompt = variables?.prompt;
        if (prompt) insert(fillVariables(prompt.body, values));
      },
      onCancel: close,
    }),
    ensureHost(),
  );
}

function onInput(event: Event): void {
  const target = event.target;
  if (!isEditable(target)) return;

  const typed = readSlashQuery(readEditableText(target));
  if (typed === null) {
    close();
    return;
  }

  // No prompts saved yet: staying silent beats a popup that only says "empty"
  // every time someone types a slash.
  if (getPrompts().length === 0) return;

  editable = target;
  query = typed;
  activeIndex = 0;
  isOpen = true;
  paint();
}

function onKeyDown(event: KeyboardEvent): void {
  // In variable-fill mode the form owns the keyboard; the composer does not.
  if (!isOpen || variables) return;

  const prompts = visiblePrompts();

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex = Math.min(Math.max(activeIndex + step, 0), Math.max(prompts.length - 1, 0));
    paint();
    return;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const prompt = prompts[activeIndex];
    if (!prompt) return;
    // Stopping Enter here is what keeps a picker selection from ever becoming a
    // sent message (hard rule 1: insertion only).
    event.preventDefault();
    event.stopPropagation();
    choose(prompt);
  }
}

export function mountSlashPicker(): () => void {
  document.getElementById(HOST_ID)?.remove();
  mountPoint = null;

  // Capture phase: Claude's composer stops some of these events on the way up.
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  const onScrollOrResize = (): void => {
    if (isOpen) paint();
  };
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('scroll', onScrollOrResize, true);

  void loadPrompts();
  const unsubscribePrompts = subscribePrompts(() => {
    if (isOpen) paint();
  });
  const unsubscribeStorage = subscribeSyncChanges((keys) => {
    if (keys.includes('prompts')) void loadPrompts();
  });

  return () => {
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onScrollOrResize);
    window.removeEventListener('scroll', onScrollOrResize, true);
    unsubscribePrompts();
    unsubscribeStorage();
    close();
  };
}
