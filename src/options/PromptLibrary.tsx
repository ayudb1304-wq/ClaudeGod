import { useEffect, useState } from 'preact/hooks';
import {
  createPrompt,
  deletePrompt,
  loadPrompts,
  parseVariables,
  PromptLimitError,
  subscribePrompts,
  updatePrompt,
  type Prompt,
} from '@/core/prompts';
import { getEntitlements, subscribeEntitlements } from '@/core/entitlements';
import { UpgradeLink } from '@/shared/UpgradeLink';
import { StorageQuotaError } from '@/shared/storage';
import { strings } from '@/shared/strings';

/**
 * Prompt CRUD (FEATURES 5.1). Lives on the settings page because that is where
 * there is room to write a prompt; the popup only lists them.
 */

interface DraftState {
  id: string | null;
  title: string;
  body: string;
  category: string;
}

const EMPTY_DRAFT: DraftState = { id: null, title: '', body: '', category: '' };

export function PromptLibrary() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePrompts(setPrompts);
    void loadPrompts();
    return unsubscribe;
  }, []);

  // Same reason as the popup's export section: entitlements arrive from
  // storage after first render, so a paying customer would otherwise see the
  // free 10-prompt ceiling until they reloaded the page.
  const [limit, setLimit] = useState(getEntitlements().maxPrompts);
  useEffect(() => subscribeEntitlements((value) => setLimit(value.maxPrompts)), []);

  const limitReached = limit !== null && prompts.length >= limit;

  function report(caught: unknown): void {
    if (caught instanceof PromptLimitError) setError(strings.prompts.limitReached(caught.limit));
    else if (caught instanceof StorageQuotaError) setError(strings.prompts.quotaError);
    else setError(strings.folders.saveError);
  }

  function save(): void {
    if (!draft) return;
    setError(null);
    const payload = { title: draft.title, body: draft.body, category: draft.category };
    const action = draft.id ? updatePrompt(draft.id, payload) : createPrompt(payload);
    action.then(() => setDraft(null)).catch(report);
  }

  return (
    <section class="cg-card">
      <h2 class="cg-card-title">{strings.prompts.title}</h2>
      <p class="cg-card-lede">{strings.prompts.emptyHint}</p>

      {prompts.length === 0 && <p class="cg-notice">{strings.prompts.empty}</p>}

      <ul class="cg-list">
        {prompts.map((prompt) => (
          <li
            key={prompt.id}
            class="cg-list-row"
            style={{ padding: '10px 0', alignItems: 'flex-start' }}
          >
            <div class="cg-grow">
              <strong>{prompt.title}</strong>
              {prompt.category && (
                <span class="cg-faint" style={{ marginLeft: 8 }}>
                  {prompt.category}
                </span>
              )}
              <div class="cg-muted cg-grow">
                {prompt.body}
              </div>
              {parseVariables(prompt.body).length > 0 && (
                <div class="cg-faint">
                  {parseVariables(prompt.body)
                    .map((name) => `{{${name}}}`)
                    .join(' ')}
                </div>
              )}
            </div>
            <button type="button" class="cg-btn"
              onClick={() => {
                setError(null);
                setDraft({
                  id: prompt.id,
                  title: prompt.title,
                  body: prompt.body,
                  category: prompt.category,
                });
              }}
            >
              {strings.prompts.edit}
            </button>
            <button type="button" class="cg-btn"
              onClick={() => {
                void deletePrompt(prompt.id).catch(report);
              }}
            >
              {strings.prompts.remove}
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p class="cg-notice" data-tone="danger">
          {error}
        </p>
      )}

      {draft ? (
        <div class="cg-field">
          <label class="cg-field">
            <span class="cg-label">{strings.prompts.fieldTitle}</span>
            <input
              class="cg-text-input"
              value={draft.title}
              onInput={(event) => {
                setDraft({ ...draft, title: (event.target as HTMLInputElement).value });
              }}
            />
          </label>
          <label class="cg-field">
            <span class="cg-label">{strings.prompts.fieldBody}</span>
            <textarea
              class="cg-text-input"
              value={draft.body}
              onInput={(event) => {
                setDraft({ ...draft, body: (event.target as HTMLTextAreaElement).value });
              }}
            />
          </label>
          <small class="cg-hint">{strings.prompts.bodyHint}</small>
          <label class="cg-field">
            <span class="cg-label">{strings.prompts.fieldCategory}</span>
            <input
              class="cg-text-input"
              value={draft.category}
              onInput={(event) => {
                setDraft({ ...draft, category: (event.target as HTMLInputElement).value });
              }}
            />
          </label>
          <div class="cg-actions">
            <button type="button" class="cg-btn" onClick={save}>
              {strings.prompts.save}
            </button>
            <button type="button" class="cg-btn"
              onClick={() => {
                setDraft(null);
              }}
            >
              {strings.prompts.cancel}
            </button>
          </div>
        </div>
      ) : limitReached && limit !== null ? (
        <p class="cg-notice">
          {strings.prompts.limitReached(limit)} <UpgradeLink source="prompt-limit" />
        </p>
      ) : (
        <button
          type="button"
          class="cg-btn cg-btn-primary"
          onClick={() => {
            setError(null);
            setDraft({ ...EMPTY_DRAFT });
          }}
        >
          {strings.prompts.add}
        </button>
      )}
    </section>
  );
}
