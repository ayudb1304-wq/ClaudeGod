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
import { StorageQuotaError } from '@/shared/storage';
import { strings } from '@/shared/strings';

/**
 * Prompt CRUD (FEATURES 5.1). Lives on the settings page because that is where
 * there is room to write a prompt; the popup only lists them.
 */

const field = {
  width: '100%',
  padding: '7px 9px',
  border: '1px solid #ccc',
  borderRadius: 6,
  font: 'inherit',
} as const;

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
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{strings.prompts.title}</h2>
      <p style={{ margin: '0 0 12px', color: '#666', fontSize: 13 }}>{strings.prompts.emptyHint}</p>

      {prompts.length === 0 && <p style={{ color: '#666' }}>{strings.prompts.empty}</p>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {prompts.map((prompt) => (
          <li
            key={prompt.id}
            style={{ padding: '10px 0', borderBottom: '1px solid #eee', display: 'flex', gap: 12 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{prompt.title}</strong>
              {prompt.category && (
                <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                  {prompt.category}
                </span>
              )}
              <div
                style={{
                  fontSize: 13,
                  color: '#555',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {prompt.body}
              </div>
              {parseVariables(prompt.body).length > 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>
                  {parseVariables(prompt.body)
                    .map((name) => `{{${name}}}`)
                    .join(' ')}
                </div>
              )}
            </div>
            <button
              type="button"
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
            <button
              type="button"
              onClick={() => {
                void deletePrompt(prompt.id).catch(report);
              }}
            >
              {strings.prompts.remove}
            </button>
          </li>
        ))}
      </ul>

      {error && <p style={{ color: '#b3492e' }}>{error}</p>}

      {draft ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <label>
            {strings.prompts.fieldTitle}
            <input
              style={field}
              value={draft.title}
              onInput={(event) => {
                setDraft({ ...draft, title: (event.target as HTMLInputElement).value });
              }}
            />
          </label>
          <label>
            {strings.prompts.fieldBody}
            <textarea
              style={{ ...field, minHeight: 120, resize: 'vertical' }}
              value={draft.body}
              onInput={(event) => {
                setDraft({ ...draft, body: (event.target as HTMLTextAreaElement).value });
              }}
            />
          </label>
          <small style={{ color: '#777' }}>{strings.prompts.bodyHint}</small>
          <label>
            {strings.prompts.fieldCategory}
            <input
              style={field}
              value={draft.category}
              onInput={(event) => {
                setDraft({ ...draft, category: (event.target as HTMLInputElement).value });
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={save}>
              {strings.prompts.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
              }}
            >
              {strings.prompts.cancel}
            </button>
          </div>
        </div>
      ) : limitReached && limit !== null ? (
        <p style={{ marginTop: 16, color: '#666' }}>{strings.prompts.limitReached(limit)}</p>
      ) : (
        <button
          type="button"
          style={{ marginTop: 16 }}
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
