import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SRC_ROOT = join(REPO_ROOT, 'src');

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html'];

export interface SourceFile {
  /** Repo-relative, forward-slashed, so assertions read the same on Windows and CI. */
  path: string;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

export function readSourceFiles(root = SRC_ROOT): SourceFile[] {
  return walk(root).map((full) => ({
    path: relative(REPO_ROOT, full).split('\\').join('/'),
    text: readFileSync(full, 'utf8'),
  }));
}

/**
 * Strips comments so that prose ABOUT forbidden things cannot fail the guards.
 * claudeAdapter.ts documents its own read-only rule by naming the banned verbs;
 * scanning raw text would flag that comment and make the guard useless noise.
 *
 * The line-comment pattern requires the `//` not be preceded by `:`, which keeps
 * `https://...` inside real code intact.
 */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}
