import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SearchHit } from '@/core/searchIndex';
import { strings } from '@/shared/strings';
import { UpgradeLink } from '@/shared/UpgradeLink';

/**
 * Cmd/Ctrl+K search overlay (FEATURES 2.1).
 *
 * Every state the spec demands is rendered: loading, empty query, zero results,
 * and degraded. "No blank panes" is an acceptance criterion, not a nicety.
 */

export type OverlayStatus = 'ready' | 'loading' | 'degraded';

export interface SearchOverlayProps {
  status: OverlayStatus;
  /** Conversations currently indexed, for the free-tier footer. */
  indexedCount: number;
  /** null when unlimited (Pro). */
  cap: number | null;
  onSearch: (query: string) => SearchHit[];
  onSelect: (hit: SearchHit) => void;
  /** Starts a drag of this conversation towards the folder panel. */
  onDragHit: (hit: SearchHit, transfer: DataTransfer | null) => void;
  onClose: () => void;
}

/** Renders a snippet with match highlighting, without ever injecting markup. */
function Snippet({ hit }: { hit: SearchHit }) {
  if (hit.highlights.length === 0) return <>{hit.snippet}</>;

  const parts: preact.ComponentChild[] = [];
  let cursor = 0;

  hit.highlights.forEach(([start, end], i) => {
    // Overlapping ranges would otherwise duplicate text.
    if (start < cursor) return;
    if (start > cursor) parts.push(hit.snippet.slice(cursor, start));
    parts.push(
      <mark key={i} class="cg-mark">
        {hit.snippet.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });

  if (cursor < hit.snippet.length) parts.push(hit.snippet.slice(cursor));
  return <>{parts}</>;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function SearchOverlay({
  status,
  indexedCount,
  cap,
  onSearch,
  onSelect,
  onDragHit,
  onClose,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(
    () => (status === 'ready' ? onSearch(query) : []),
    [query, status, onSearch],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    const node = listRef.current?.children[active];
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const hit = results[active];
        if (hit) onSelect(hit);
      }
    },
    [results, active, onSelect, onClose],
  );

  const body = (() => {
    if (status === 'loading') {
      return <p class="cg-state">{strings.search.loading}</p>;
    }
    if (status === 'degraded') {
      return <p class="cg-state">{strings.sync.degraded}</p>;
    }
    if (query.trim().length === 0) {
      return <p class="cg-state">{strings.search.prompt(indexedCount)}</p>;
    }
    if (results.length === 0) {
      return <p class="cg-state">{strings.search.noResults(query.trim())}</p>;
    }

    return (
      <ul class="cg-results" ref={listRef} role="listbox">
        {results.map((hit, i) => (
          <li
            key={`${hit.convUuid}:${String(hit.messageIndex)}`}
            role="option"
            aria-selected={i === active}
            class={i === active ? 'cg-row cg-row-active' : 'cg-row'}
            // FEATURES 4.1: results are a drag source for the folder panel.
            draggable
            onDragStart={(event) => {
              onDragHit(hit, event.dataTransfer);
            }}
            onMouseEnter={() => {
              setActive(i);
            }}
            onClick={() => {
              onSelect(hit);
            }}
          >
            <div class="cg-row-head">
              <span class="cg-title">{hit.title || strings.search.untitled}</span>
              <span class="cg-date">{formatDate(hit.updatedAt)}</span>
            </div>
            <div class="cg-snippet">
              <Snippet hit={hit} />
            </div>
          </li>
        ))}
      </ul>
    );
  })();

  return (
    <div
      class="cg-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div class="cg-panel" role="dialog" aria-modal="true" aria-label={strings.search.ariaLabel}>
        <input
          ref={inputRef}
          class="cg-input"
          type="text"
          value={query}
          placeholder={strings.search.placeholder}
          aria-label={strings.search.ariaLabel}
          onInput={(event) => {
            setQuery((event.target as HTMLInputElement).value);
          }}
          onKeyDown={onKeyDown}
        />
        {body}
        <div class="cg-footer">
          {cap === null ? (
            strings.search.footerPro
          ) : (
            <>
              {strings.search.footerFree(cap)} <UpgradeLink source="search-cap" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
