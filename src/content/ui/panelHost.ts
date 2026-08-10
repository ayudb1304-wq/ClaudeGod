import { h, render } from 'preact';
import { FolderPanel } from './FolderPanel';
import { PANEL_STYLES } from './panelStyles';
import { shieldKeyboardEvents } from './shieldKeyboard';
import {
  addConversationToFolder,
  createFolder,
  deleteFolder,
  FolderLimitError,
  getFolders,
  loadFolders,
  removeConversationFromFolder,
  renameFolder,
  subscribeFolders,
  type Folder,
} from '@/core/folders';
import { getConversationTitles } from '@/core/db';
import { getEntitlements } from '@/core/entitlements';
import { exportConversation, exportConversationsZip } from '@/core/exporter';
import { conversationUrl } from '../jumpToMessage';
import { conversationUuidFromUrl } from '../dragData';
import { watchSidebarDrags } from '../sidebarDrag';
import { readSettings, updateSettings } from '@/shared/settings';
import { StorageQuotaError, subscribeSyncChanges } from '@/shared/storage';
import { downloadFile } from '@/shared/download';
import { strings } from '@/shared/strings';

/**
 * Mounts the folder panel into its own shadow root and wires it to the store.
 *
 * Same shadow-DOM reasoning as the search overlay: no style can cross in either
 * direction. This host owns all the side effects (storage writes, navigation,
 * export) so the component stays a pure render of props.
 */

const HOST_ID = 'claudegod-panel-host';

let mountPoint: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let open = false;
let titles = new Map<string, string>();
let error: string | null = null;
let status: string | null = null;
let currentConvUuid: string | null = null;
let dragOverFolderId: string | null = null;
/** True while a sidebar drag forced the drawer open, so it can close again. */
let openedForDrag = false;

/** How often we re-read the URL. Claude is a SPA, so there is no navigation event. */
const URL_POLL_MS = 1000;

function ensureHost(): HTMLDivElement {
  if (mountPoint) return mountPoint;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // Below the search overlay: when both are up, search is the modal one.
  host.style.cssText = 'all:initial;position:fixed;top:0;right:0;z-index:2147483645';
  document.body.appendChild(host);
  // Without this, typing a folder name lands in Claude's composer and Enter
  // sends it as a message. See shieldKeyboard.ts.
  shieldKeyboardEvents(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PANEL_STYLES;
  shadow.appendChild(style);

  const mount = document.createElement('div');
  shadow.appendChild(mount);
  mountPoint = mount;
  shadowRoot = shadow;
  return mount;
}

/**
 * Which folder sits under a viewport point.
 *
 * The pointer-drag path has no dragover event to tell it, and the rows live in
 * a shadow root, so the document's own hit test only ever reports our host.
 */
function folderAt(x: number, y: number): string | null {
  const element = shadowRoot?.elementFromPoint(x, y);
  if (!(element instanceof HTMLElement)) return null;
  return element.closest<HTMLElement>('[data-folder-id]')?.dataset['folderId'] ?? null;
}

/** Folders hold ids only, so display names come from the local mirror. */
async function refreshTitles(folders: Folder[]): Promise<void> {
  const ids = [...new Set(folders.flatMap((folder) => folder.convIds))];
  try {
    titles = await getConversationTitles(ids);
  } catch {
    // Without titles the panel still lists and opens chats, just anonymously.
    titles = new Map();
  }
  paint();
}

function reportError(caught: unknown): void {
  if (caught instanceof FolderLimitError) {
    error = strings.folders.limitReached(caught.limit);
  } else if (caught instanceof StorageQuotaError) {
    error = strings.folders.quotaError;
  } else {
    error = strings.folders.saveError;
  }
  paint();
}

/** Any successful action clears the last complaint. */
function run(action: Promise<unknown>): void {
  error = null;
  paint();
  void action.catch(reportError);
}

async function exportChat(convUuid: string): Promise<void> {
  try {
    const file = await exportConversation(convUuid);
    // Export reads the local mirror only, so an unsynced chat has nothing to
    // write — say that rather than handing over an empty file.
    if (!file) {
      status = strings.exportUi.notIndexed;
    } else {
      downloadFile(file);
      status = null;
    }
  } catch {
    status = strings.exportUi.failed;
  }
  paint();
}

async function exportFolder(folderId: string): Promise<void> {
  const folder = getFolders().find((candidate) => candidate.id === folderId);
  if (!folder) return;

  if (!getEntitlements().bulkExport) {
    status = strings.exportUi.proOnly;
    paint();
    return;
  }
  if (folder.convIds.length === 0) {
    status = strings.exportUi.empty;
    paint();
    return;
  }

  try {
    const file = await exportConversationsZip(folder.convIds, {
      onProgress: (done, total) => {
        status = strings.exportUi.working(done, total);
        paint();
      },
    });
    downloadFile(file);
    status = null;
  } catch {
    status = strings.exportUi.failed;
  }
  paint();
}

function paint(): void {
  const folders = getFolders();
  const entitlements = getEntitlements();
  const limit = entitlements.maxFolders;

  render(
    h(FolderPanel, {
      open,
      folders,
      titles,
      limitReached: limit !== null && folders.length >= limit,
      maxFolders: limit,
      error,
      status,
      currentConvUuid,
      dragOverFolderId,
      onExportChat: (convUuid: string) => {
        void exportChat(convUuid);
      },
      onToggle: () => {
        open = !open;
        openedForDrag = false;
        paint();
        void updateSettings({ folderPanel: { open } });
      },
      onCreate: (name: string) => {
        run(createFolder(name));
      },
      onRename: (id: string, name: string) => {
        run(renameFolder(id, name));
      },
      onDelete: (id: string) => {
        run(deleteFolder(id));
      },
      onDrop: (id: string, convUuid: string) => {
        run(addConversationToFolder(id, convUuid));
      },
      onRemoveChat: (id: string, convUuid: string) => {
        run(removeConversationFromFolder(id, convUuid));
      },
      onOpenChat: (convUuid: string) => {
        window.location.assign(conversationUrl(convUuid));
      },
      onExportFolder: (id: string) => {
        void exportFolder(id);
      },
    }),
    ensureHost(),
  );
}

/**
 * Drops coming from Claude's own sidebar, where their `draggable="false"`
 * rules out the HTML5 path entirely (see content/sidebarDrag.ts).
 *
 * The drawer opens itself for the duration of the drag when it was closed —
 * there is nothing to aim at otherwise — and closes again if the drop misses.
 */
function watchDrags(): void {
  watchSidebarDrags({
    onStart: () => {
      if (!open) {
        open = true;
        openedForDrag = true;
      }
      paint();
    },
    onMove: (x, y) => {
      const next = folderAt(x, y);
      if (next === dragOverFolderId) return;
      dragOverFolderId = next;
      paint();
    },
    onDrop: (convUuid, x, y) => {
      const folderId = folderAt(x, y);
      dragOverFolderId = null;
      if (!folderId) {
        closeIfOpenedForDrag();
        return false;
      }
      openedForDrag = false;
      run(addConversationToFolder(folderId, convUuid));
      return true;
    },
    onCancel: () => {
      dragOverFolderId = null;
      closeIfOpenedForDrag();
    },
  });
}

function closeIfOpenedForDrag(): void {
  if (openedForDrag) {
    open = false;
    openedForDrag = false;
  }
  paint();
}

export function mountFolderPanel(): void {
  void (async () => {
    try {
      // A stale copy can survive an extension reload on an open tab.
      document.getElementById(HOST_ID)?.remove();
      mountPoint = null;

      open = (await readSettings()).folderPanel.open;
      currentConvUuid = conversationUuidFromUrl(window.location.pathname);
      setInterval(() => {
        const next = conversationUuidFromUrl(window.location.pathname);
        if (next === currentConvUuid) return;
        currentConvUuid = next;
        status = null;
        paint();
      }, URL_POLL_MS);

      watchDrags();
      subscribeFolders((folders) => {
        paint();
        void refreshTitles(folders);
      });
      await loadFolders();

      // Folders edited in the popup (or on another device) land here too.
      subscribeSyncChanges((keys) => {
        if (keys.includes('folders')) void loadFolders();
      });
    } catch {
      // The panel is additive. If it cannot mount, Claude's page is untouched.
    }
  })();
}
