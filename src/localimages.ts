/* eslint-disable @typescript-eslint/no-unused-vars -- keeps the desktop module's signatures */
// Browser stand-in for the desktop app's localimages.ts, which reads image
// files from disk via Tauri. A web page cannot read a path like
// `./figures/plot.png`, and a document opened through the File System Access
// API or an upload has no path. A local reference is passed through as-is
// and its load always fails, so the editor shows "Could not load" with the
// reason instead of a hint to save the document, which would not help.

export function setCurrentDocumentPath(_path: string | null): void {}

export function getCurrentDocumentPath(): string | null {
  return null;
}

export function resolveLocalImagePath(
  url: string,
  _documentPath: string | null,
): string | null {
  return url;
}

export function relativizeUnderDocument(
  _absolutePath: string,
  _documentPath: string | null,
): string | null {
  return null;
}

export function loadFailureCount(_resolvedPath: string): number {
  return 0;
}

export interface LocalImage {
  dataUrl: string;
  foundAt: string | null;
}

export class AmbiguousImageError extends Error {
  constructor(
    readonly name: string,
    readonly candidates: readonly string[],
  ) {
    super(`Several files named ${name}`);
  }
}

export function loadLocalImageWithFallback(
  resolvedPath: string,
  _documentPath: string | null,
): Promise<LocalImage> {
  return Promise.reject(
    new Error(
      `The web version cannot read files from your disk (${resolvedPath}).`,
    ),
  );
}
