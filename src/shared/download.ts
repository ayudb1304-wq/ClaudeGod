/**
 * Saves a generated file to disk.
 *
 * An object URL plus a synthetic click, deliberately: the `downloads`
 * permission is not in our frozen set (CLAUDE.md rule 5) and this needs none.
 * Works the same from the content script and from extension pages.
 */
export function downloadFile(file: {
  filename: string;
  data: string | Uint8Array;
  mimeType: string;
}): void {
  // TypeScript allows for a SharedArrayBuffer-backed Uint8Array, which Blob
  // rejects. Ours always come from TextEncoder or fflate, never shared.
  const part: BlobPart =
    typeof file.data === 'string' ? file.data : (file.data as Uint8Array<ArrayBuffer>);
  const blob = new Blob([part], { type: file.mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in some Chrome versions.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}
