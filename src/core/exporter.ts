import { zip } from 'fflate';
import {
  db,
  type ArtifactRecord,
  type ClaudeGodDb,
  type ConversationRecord,
  type MessageRecord,
} from './db';

/**
 * Export (FEATURES 6.1/6.2).
 *
 * Reads from the local mirror only — export never talks to claude.ai, so it
 * works offline and costs the API nothing.
 *
 * Like sync, this depends on a port rather than Dexie directly, so the markdown
 * and ZIP layout can be tested without a database.
 */

export interface ExportBundle {
  conversation: ConversationRecord;
  messages: MessageRecord[];
  artifacts: ArtifactRecord[];
}

export interface ExportSource {
  listConversationUuids(): Promise<string[]>;
  loadBundle(convUuid: string): Promise<ExportBundle | null>;
}

// ---------------------------------------------------------------------------
// Filenames
// ---------------------------------------------------------------------------

const MAX_SLUG_LENGTH = 60;

/**
 * Filesystem-safe slug. Conservative on purpose: these names land in ZIPs that
 * get unpacked on Windows, macOS, and Linux, and a title can contain anything a
 * user typed.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    // Control characters plus the punctuation Windows forbids in filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/[-.]+$/, '');

  return slug || 'untitled-chat';
}

/** YYYY-MM-DD from an ISO timestamp, falling back to today. */
export function isoDate(value: string | null, now = new Date()): string {
  const parsed = value ? Date.parse(value) : Number.NaN;
  const date = Number.isFinite(parsed) ? new Date(parsed) : now;
  return date.toISOString().slice(0, 10);
}

export function conversationFilename(conversation: ConversationRecord, now = new Date()): string {
  return `${slugify(conversation.title)}-${isoDate(conversation.updatedAt, now)}.md`;
}

/** Best-effort extension from the artifact's declared type or language. */
export function artifactExtension(artifact: ArtifactRecord): string {
  const byLanguage: Record<string, string> = {
    typescript: 'ts',
    tsx: 'tsx',
    javascript: 'js',
    jsx: 'jsx',
    python: 'py',
    ruby: 'rb',
    rust: 'rs',
    go: 'go',
    java: 'java',
    csharp: 'cs',
    cpp: 'cpp',
    c: 'c',
    sql: 'sql',
    bash: 'sh',
    shell: 'sh',
    json: 'json',
    yaml: 'yaml',
    html: 'html',
    css: 'css',
    markdown: 'md',
  };

  const language = artifact.language?.toLowerCase() ?? '';
  if (byLanguage[language]) return byLanguage[language];

  const type = artifact.type?.toLowerCase() ?? '';
  if (type.includes('markdown')) return 'md';
  if (type.includes('html')) return 'html';
  if (type.includes('svg')) return 'svg';
  if (type.includes('react')) return 'jsx';
  if (type.includes('mermaid')) return 'mmd';
  return 'txt';
}

/**
 * Artifact titles are usually already filenames ("chunker.ts"), so the derived
 * extension is only appended when it is not there already.
 */
export function artifactFilename(artifact: ArtifactRecord): string {
  const extension = artifactExtension(artifact);
  const base = slugify(artifact.title ?? artifact.id);
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function roleLabel(sender: string): string {
  if (sender === 'human') return 'You';
  if (sender === 'assistant') return 'Claude';
  // Unknown senders are possible if Claude adds a role; show it rather than
  // guessing or dropping the message.
  return sender || 'Unknown';
}

function timestamp(value: string | null): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().replace('T', ' ').slice(0, 16)
    : '';
}

export interface MarkdownOptions {
  /** artifact id → relative path. Present in ZIP export; absent inline-exports. */
  artifactPaths?: Map<string, string>;
}

/**
 * Message text is already Markdown as Claude wrote it (fences, lists, tables),
 * so it is emitted verbatim — reformatting it would be the surest way to break
 * a code block.
 */
export function conversationToMarkdown(
  bundle: ExportBundle,
  options: MarkdownOptions = {},
): string {
  const { conversation, messages, artifacts } = bundle;
  const lines: string[] = [];

  lines.push(`# ${conversation.title || 'Untitled chat'}`, '');
  const meta = [`${String(messages.length)} messages`];
  if (conversation.createdAt) meta.push(`started ${isoDate(conversation.createdAt)}`);
  meta.push(`updated ${isoDate(conversation.updatedAt)}`);
  lines.push(`_${meta.join(' · ')}_`, '');

  for (const message of [...messages].sort((left, right) => left.index - right.index)) {
    const when = timestamp(message.createdAt);
    lines.push(`## ${roleLabel(message.sender)}${when ? ` — ${when}` : ''}`, '');
    lines.push(message.text.length > 0 ? message.text : '_(no text content)_', '');
    if (message.truncated) lines.push('_(message truncated in the local copy)_', '');
  }

  if (artifacts.length > 0) {
    lines.push('---', '', '## Artifacts', '');
    for (const artifact of artifacts) {
      const name = artifact.title ?? artifact.id;
      const path = options.artifactPaths?.get(artifact.id);
      lines.push(path ? `### [${name}](${path})` : `### ${name}`, '');
      if (artifact.possiblyStale) {
        lines.push('_Edited after the last full snapshot; this copy may be out of date._', '');
      }
      if (!path) {
        const fence = artifact.content.includes('```') ? '````' : '```';
        lines.push(`${fence}${artifact.language ?? ''}`, artifact.content, fence, '');
      }
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dexie-backed source
// ---------------------------------------------------------------------------

export function createDexieExportSource(database: ClaudeGodDb = db): ExportSource {
  return {
    async listConversationUuids() {
      const rows = await database.conversations.orderBy('updatedAt').reverse().toArray();
      return rows.filter((row) => row.indexedAt !== null).map((row) => row.uuid);
    },
    async loadBundle(convUuid) {
      const conversation = await database.conversations.get(convUuid);
      if (!conversation) return null;
      const messages = await database.messages.where('convUuid').equals(convUuid).toArray();
      const artifacts = await database.artifacts.where('convUuid').equals(convUuid).toArray();
      return { conversation, messages, artifacts };
    },
  };
}

// ---------------------------------------------------------------------------
// Single conversation
// ---------------------------------------------------------------------------

export interface ExportedFile {
  filename: string;
  /** Markdown for single exports; ZIP bytes for bulk. */
  data: string | Uint8Array;
  mimeType: string;
}

export async function exportConversation(
  convUuid: string,
  source: ExportSource = createDexieExportSource(),
  now = new Date(),
): Promise<ExportedFile | null> {
  const bundle = await source.loadBundle(convUuid);
  if (!bundle) return null;
  return {
    filename: conversationFilename(bundle.conversation, now),
    data: conversationToMarkdown(bundle),
    mimeType: 'text/markdown',
  };
}

// ---------------------------------------------------------------------------
// Bulk ZIP
// ---------------------------------------------------------------------------

export interface BulkExportOptions {
  source?: ExportSource;
  /** Called after each conversation so the UI can show honest progress. */
  onProgress?: (done: number, total: number) => void;
  /** Set by the UI when the user cancels; checked between conversations. */
  isCancelled?: () => boolean;
  now?: Date;
}

/** Keeps ZIP entry paths unique when two chats share a title. */
function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf('.');
  const stem = dot === -1 ? path : path.slice(0, dot);
  const extension = dot === -1 ? '' : path.slice(dot);
  let counter = 2;
  while (used.has(`${stem}-${String(counter)}${extension}`)) counter += 1;
  const next = `${stem}-${String(counter)}${extension}`;
  used.add(next);
  return next;
}

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // fflate's async zip yields between files, which is what keeps a 500-chat
    // export from freezing the page.
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

/**
 * Builds a ZIP of Markdown files with artifacts extracted alongside them
 * (FEATURES 6.2).
 *
 * Layout:
 *   chats/{slug}-{date}.md
 *   artifacts/{slug}-{date}/{artifact}.{ext}
 *
 * Conversations are loaded one at a time and awaited, so the event loop keeps
 * breathing between them; the UI stays responsive and progress is real.
 */
export async function exportConversationsZip(
  convUuids: string[],
  options: BulkExportOptions = {},
): Promise<ExportedFile> {
  const source = options.source ?? createDexieExportSource();
  const now = options.now ?? new Date();
  const encoder = new TextEncoder();

  const files: Record<string, Uint8Array> = {};
  const usedPaths = new Set<string>();
  const index: string[] = [
    '# Exported Claude chats',
    '',
    `_${String(convUuids.length)} chats_`,
    '',
  ];

  let done = 0;
  for (const convUuid of convUuids) {
    if (options.isCancelled?.()) break;

    const bundle = await source.loadBundle(convUuid);
    done += 1;
    options.onProgress?.(done, convUuids.length);
    // A conversation listed but not yet detail-synced simply is not in the ZIP.
    if (!bundle) continue;

    const name = conversationFilename(bundle.conversation, now);
    const chatPath = uniquePath(usedPaths, `chats/${name}`);
    const folder = chatPath.slice('chats/'.length).replace(/\.md$/, '');

    const artifactPaths = new Map<string, string>();
    for (const artifact of bundle.artifacts) {
      const path = uniquePath(usedPaths, `artifacts/${folder}/${artifactFilename(artifact)}`);
      artifactPaths.set(artifact.id, path);
      files[path] = encoder.encode(artifact.content);
    }

    files[chatPath] = encoder.encode(
      // Links are relative to the chat file, which sits one directory deep.
      conversationToMarkdown(bundle, {
        artifactPaths: new Map([...artifactPaths].map(([id, path]) => [id, `../${path}`] as const)),
      }),
    );
    index.push(`- [${bundle.conversation.title || 'Untitled chat'}](${chatPath})`);
  }

  files['index.md'] = encoder.encode(index.join('\n'));

  return {
    filename: `claude-chats-${isoDate(null, now)}.zip`,
    data: await zipAsync(files),
    mimeType: 'application/zip',
  };
}
