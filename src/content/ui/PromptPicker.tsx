import { useState } from 'preact/hooks';
import type { Prompt } from '@/core/prompts';
import { strings } from '@/shared/strings';

/**
 * The `/` prompt picker (FEATURES 5.1).
 *
 * Presentational: the host owns filtering, keyboard handling (keys stay with
 * Claude's composer, which never loses focus) and insertion. Two modes — a list
 * of prompts, and the variable form a Pro user gets when the chosen prompt has
 * `{{placeholders}}`.
 */

export interface PromptPickerProps {
  prompts: Prompt[];
  activeIndex: number;
  /** Where the composer is, so the picker can sit just above it. */
  anchor: { left: number; bottom: number };
  /** Non-null when collecting values for a chosen prompt's placeholders. */
  variables: { prompt: Prompt; names: string[] } | null;
  /** Quiet upgrade line when a free user picks a prompt with placeholders. */
  note: string | null;
  onSelect: (prompt: Prompt) => void;
  onHover: (index: number) => void;
  onFill: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function PromptPicker(props: PromptPickerProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const style = {
    left: `${String(props.anchor.left)}px`,
    bottom: `${String(props.anchor.bottom)}px`,
  };

  if (props.variables) {
    return (
      <div
        class="cg-picker"
        style={style}
        role="dialog"
        aria-label={strings.prompts.variablesTitle}
      >
        <div class="cg-vars">
          <strong>{strings.prompts.variablesTitle}</strong>
          {props.variables.names.map((name) => (
            <label key={name}>
              {name}
              <input
                class="cg-input"
                autofocus={name === props.variables?.names[0]}
                value={values[name] ?? ''}
                onInput={(event) => {
                  setValues({ ...values, [name]: (event.target as HTMLInputElement).value });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') props.onFill(values);
                  if (event.key === 'Escape') props.onCancel();
                }}
              />
            </label>
          ))}
          <div class="cg-actions">
            <button type="button" class="cg-btn" onClick={props.onCancel}>
              {strings.prompts.cancel}
            </button>
            <button
              type="button"
              class="cg-btn"
              onClick={() => {
                props.onFill(values);
              }}
            >
              {strings.prompts.variablesInsert}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="cg-picker" style={style} role="listbox" aria-label={strings.prompts.title}>
      {props.prompts.length === 0 ? (
        <p class="cg-note">{strings.prompts.noMatches}</p>
      ) : (
        <ul class="cg-list">
          {props.prompts.map((prompt, index) => (
            <li
              key={prompt.id}
              class="cg-item"
              role="option"
              aria-selected={index === props.activeIndex}
              data-active={String(index === props.activeIndex)}
              onMouseEnter={() => {
                props.onHover(index);
              }}
              // mousedown, not click: click would land after the composer has
              // already lost focus, and we need the composer focused to insert.
              onMouseDown={(event) => {
                event.preventDefault();
                props.onSelect(prompt);
              }}
            >
              <div class="cg-item-title">{prompt.title}</div>
              <div class="cg-item-body">{prompt.body}</div>
            </li>
          ))}
        </ul>
      )}
      {props.note && <div class="cg-foot">{props.note}</div>}
    </div>
  );
}
