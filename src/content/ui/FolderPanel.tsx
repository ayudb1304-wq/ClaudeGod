import { useState } from 'preact/hooks';
import type { Folder } from '@/core/folders';
import { looksLikeConversationDrag, readConversationUuid } from '../dragData';
import { strings } from '@/shared/strings';
import { UpgradeLink } from '@/shared/UpgradeLink';

/**
 * Folder panel (FEATURES 4.1).
 *
 * A drawer on the right edge with an always-visible handle, rather than an
 * injection into Claude's sidebar: their markup is unversioned and unowned by
 * us, and the M2 jump-to-message work already showed how quickly DOM anchors
 * stop matching. Right rather than left because the left is where Claude's own
 * chat list lives, and covering it would make the panel something users close
 * once and never reopen — dragging a chat across the page still works.
 *
 * Folders hold ids only, so titles arrive separately from the local mirror; a
 * chat we have not indexed still shows and still opens.
 */

export interface FolderPanelProps {
  open: boolean;
  folders: Folder[];
  /** convUuid → title, resolved from IndexedDB by the host. */
  titles: Map<string, string>;
  limitReached: boolean;
  maxFolders: number | null;
  /** Calm one-liner from a failed save (quota, storage hiccup). */
  error: string | null;
  /** Progress line while an export runs. */
  status: string | null;
  /** Set when the user is viewing a conversation, so it can be exported. */
  currentConvUuid: string | null;
  /** Folder under the pointer during a sidebar drag (see content/sidebarDrag). */
  dragOverFolderId: string | null;
  onToggle: () => void;
  onExportChat: (convUuid: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDrop: (id: string, convUuid: string) => void;
  onRemoveChat: (id: string, convUuid: string) => void;
  onOpenChat: (convUuid: string) => void;
  onExportFolder: (id: string) => void;
}

function FolderRow({
  folder,
  titles,
  props,
}: {
  folder: Folder;
  titles: Map<string, string>;
  props: FolderPanelProps;
}) {
  const [expanded, setExpanded] = useState(false);
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState(false);

  return (
    <li
      class="cg-folder"
      // Hit-tested by the pointer-drag path, which cannot use React-style props.
      data-folder-id={folder.id}
      data-over={String(over || props.dragOverFolderId === folder.id)}
      onDragOver={(event) => {
        if (!looksLikeConversationDrag(event.dataTransfer?.types ?? [])) return;
        // preventDefault is what makes this a drop target at all.
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const convUuid = readConversationUuid(event.dataTransfer);
        // A drag that carried no chat is a miss, not an error worth reporting.
        if (convUuid) props.onDrop(folder.id, convUuid);
      }}
    >
      <div
        class="cg-folder-head"
        onClick={() => {
          setExpanded((value) => !value);
        }}
      >
        <span class="cg-dot" style={{ background: folder.color }} />
        {renaming ? (
          <input
            class="cg-input"
            autofocus
            defaultValue={folder.name}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onBlur={(event) => {
              props.onRename(folder.id, (event.target as HTMLInputElement).value);
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              if (event.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span class="cg-folder-name">{folder.name}</span>
        )}
        <span class="cg-count">{strings.folders.count(folder.convIds.length)}</span>
        <button
          type="button"
          class="cg-icon"
          title={strings.folders.rename}
          aria-label={strings.folders.rename}
          onClick={(event) => {
            event.stopPropagation();
            setRenaming(true);
          }}
        >
          ✎
        </button>
        <button
          type="button"
          class="cg-icon"
          title={strings.folders.remove}
          aria-label={strings.folders.remove}
          onClick={(event) => {
            event.stopPropagation();
            if (confirm(strings.folders.confirmDelete(folder.name))) props.onDelete(folder.id);
          }}
        >
          ×
        </button>
      </div>

      {expanded && (
        <ul class="cg-chats">
          {folder.convIds.length === 0 && <li class="cg-note">{strings.folders.emptyFolder}</li>}
          {folder.convIds.map((convUuid) => {
            const title = titles.get(convUuid);
            return (
              <li class="cg-chat" key={convUuid} data-known={String(title !== undefined)}>
                <button
                  type="button"
                  class="cg-link"
                  title={title ?? strings.folders.unknownChat}
                  onClick={() => {
                    props.onOpenChat(convUuid);
                  }}
                >
                  {title ?? strings.folders.unknownChat}
                </button>
                <button
                  type="button"
                  class="cg-icon"
                  title={strings.folders.removeChat}
                  aria-label={strings.folders.removeChat}
                  onClick={() => {
                    props.onRemoveChat(folder.id, convUuid);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
          {folder.convIds.length > 0 && (
            <li class="cg-chat">
              <button
                type="button"
                class="cg-icon"
                onClick={() => {
                  props.onExportFolder(folder.id);
                }}
              >
                {strings.exportUi.folder}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function FolderPanel(props: FolderPanelProps) {
  const [draft, setDraft] = useState('');

  return (
    <div class="cg-wrap" data-open={String(props.open)}>
      <div class="cg-drawer" aria-hidden={!props.open}>
        <div class="cg-head">
          <h2>{strings.folders.title}</h2>
        </div>

        {props.folders.length === 0 ? (
          <p class="cg-empty">{strings.folders.empty}</p>
        ) : (
          <ul class="cg-list">
            {props.folders.map((folder) => (
              <FolderRow key={folder.id} folder={folder} titles={props.titles} props={props} />
            ))}
          </ul>
        )}

        <div class="cg-foot">
          {props.status && <p class="cg-note">{props.status}</p>}
          {props.error && <p class="cg-note cg-error">{props.error}</p>}
          {props.limitReached && props.maxFolders !== null ? (
            // Quiet contextual CTA (FEATURES 7.1): a line of text, never a modal.
            <p class="cg-note">
              {strings.folders.limitReached(props.maxFolders)}{' '}
              <UpgradeLink source="folder-limit" />
            </p>
          ) : (
            <>
              <input
                class="cg-input"
                placeholder={strings.folders.createPlaceholder}
                value={draft}
                onInput={(event) => {
                  setDraft((event.target as HTMLInputElement).value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || draft.trim().length === 0) return;
                  props.onCreate(draft);
                  setDraft('');
                }}
              />
              <div class="cg-actions">
                <button
                  type="button"
                  class="cg-btn"
                  disabled={draft.trim().length === 0}
                  onClick={() => {
                    props.onCreate(draft);
                    setDraft('');
                  }}
                >
                  {strings.folders.create}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div class="cg-handles">
        <button
          type="button"
          class="cg-handle"
          aria-expanded={props.open}
          aria-label={props.open ? strings.folders.close : strings.folders.open}
          onClick={props.onToggle}
        >
          {strings.folders.title}
        </button>
        {/* FEATURES 6.1: the export affordance for the conversation on screen.
            It rides the panel handle rather than being injected into Claude's
            own toolbar, which is markup we neither own nor can rely on. */}
        {props.currentConvUuid && (
          <button
            type="button"
            class="cg-handle"
            title={strings.exportUi.chat}
            aria-label={strings.exportUi.chat}
            onClick={() => {
              if (props.currentConvUuid) props.onExportChat(props.currentConvUuid);
            }}
          >
            ↓ .md
          </button>
        )}
      </div>
    </div>
  );
}
