// Browser platform adapter. Replaces every @tauri-apps/* call the source
// desktop app made in main.ts, behind one interface with two backends: the
// File System Access API where available, and an upload/download fallback
// (Firefox, Safari) where it isn't. main.ts calls through this module and
// never branches on browser support itself.

export type FileRef =
  | { kind: "fsa"; handle: FileSystemFileHandle; name: string }
  | { kind: "fallback"; name: string };

export interface OpenResult {
  ref: FileRef;
  content: string;
}

export interface SaveOptions {
  suggestedName: string;
  forcePrompt: boolean;
}

export type SaveOutcome =
  | { ok: true; ref: FileRef }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; error: unknown };

export const hasFileSystemAccess: boolean =
  typeof window !== "undefined" &&
  "showOpenFilePicker" in window &&
  "showSaveFilePicker" in window;

const MARKDOWN_TYPES: FilePickerAcceptType[] = [
  {
    description: "Markdown",
    accept: { "text/markdown": [".md", ".markdown"] },
  },
];

const HTML_TYPES: FilePickerAcceptType[] = [
  { description: "HTML", accept: { "text/html": [".html"] } },
];

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * The single implementation of the byte-exact round trip (BOM, CRLF/CR/LF,
 * trailing-newline-or-not) that the desktop app implements in Rust via
 * `fs::read` + strict `String::from_utf8`. `File.text()` uses a lossy decode
 * and must never be used here — both backends funnel through this.
 */
export async function decodeFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    // ignoreBOM: true is load-bearing — TextDecoder strips a leading BOM by
    // default, which would silently break the byte-exact round trip.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      buf,
    );
  } catch {
    throw new Error(`${file.name} is not valid UTF-8 text`);
  }
}

function encodeText(contents: string): Uint8Array {
  return new TextEncoder().encode(contents);
}

// --- File System Access backend ---------------------------------------------

/**
 * A handle's write permission can lapse across a reload with no event to
 * observe it, so this must be checked on every save, not just once after a
 * fresh picker call.
 */
async function verifyWritePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

async function openViaFsa(): Promise<OpenResult | null> {
  let handles: FileSystemFileHandle[];
  try {
    handles = await window.showOpenFilePicker!({
      types: MARKDOWN_TYPES,
      multiple: false,
    });
  } catch (err) {
    if (isAbort(err)) return null;
    throw err;
  }
  const handle = handles[0];
  const content = await decodeFile(await handle.getFile());
  return { ref: { kind: "fsa", handle, name: handle.name }, content };
}

async function pickSaveHandle(
  types: FilePickerAcceptType[],
  suggestedName: string,
): Promise<FileSystemFileHandle | { cancelled: true }> {
  try {
    return await window.showSaveFilePicker!({ types, suggestedName });
  } catch (err) {
    if (isAbort(err)) return { cancelled: true };
    throw err;
  }
}

/** Exported for direct unit testing of the permission-check path — jsdom has
 * no real File System Access API to drive `saveDocument` through, since
 * `hasFileSystemAccess` is naturally false there. */
export async function writeToHandle(
  handle: FileSystemFileHandle,
  contents: string,
): Promise<SaveOutcome> {
  if (!(await verifyWritePermission(handle))) {
    return {
      ok: false,
      reason: "error",
      error: new Error("Permission to write this file was denied"),
    };
  }
  const writable = await handle.createWritable();
  await writable.write(encodeText(contents));
  await writable.close();
  return { ok: true, ref: { kind: "fsa", handle, name: handle.name } };
}

async function saveViaFsa(
  ref: FileRef | null,
  content: string,
  opts: SaveOptions,
): Promise<SaveOutcome> {
  let handle: FileSystemFileHandle;
  if (ref?.kind === "fsa" && !opts.forcePrompt) {
    handle = ref.handle;
  } else {
    const picked = await pickSaveHandle(MARKDOWN_TYPES, opts.suggestedName);
    if ("cancelled" in picked) return { ok: false, reason: "cancelled" };
    handle = picked;
  }
  try {
    return await writeToHandle(handle, content);
  } catch (err) {
    return { ok: false, reason: "error", error: err };
  }
}

async function writeStandaloneViaFsa(
  suggestedName: string,
  contents: string,
): Promise<SaveOutcome> {
  const picked = await pickSaveHandle(HTML_TYPES, suggestedName);
  if ("cancelled" in picked) return { ok: false, reason: "cancelled" };
  try {
    return await writeToHandle(picked, contents);
  } catch (err) {
    return { ok: false, reason: "error", error: err };
  }
}

// --- Upload/download fallback backend ---------------------------------------

let fallbackInput: HTMLInputElement | null = null;
function getFallbackInput(): HTMLInputElement {
  if (fallbackInput) return fallbackInput;
  fallbackInput = document.createElement("input");
  fallbackInput.type = "file";
  fallbackInput.accept = ".md,.markdown";
  fallbackInput.hidden = true;
  document.body.appendChild(fallbackInput);
  return fallbackInput;
}

/**
 * A real file picker can only open from a direct user-gesture click on an
 * <input> — not from an arbitrary async call, the way showOpenFilePicker()
 * works — so this bridges the input's change event into the same
 * Promise<OpenResult | null> shape the FSA backend returns.
 */
function openViaFallback(): Promise<OpenResult | null> {
  const input = getFallbackInput();
  return new Promise((resolve, reject) => {
    input.value = "";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      decodeFile(file)
        .then((content) =>
          resolve({ ref: { kind: "fallback", name: file.name }, content }),
        )
        .catch(reject);
    };
    input.click();
  });
}

function downloadBlob(name: string, contents: string, mimeType: string) {
  const blob = new Blob([encodeText(contents)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revoking immediately can clip an in-flight download in some browsers
  // (notably Safari); a short delay is the common workaround.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * This backend cannot detect cancellation: there is no OS save dialog for
 * script to observe, only the browser's own opaque download handling. A
 * "save" here always immediately produces a download, so the caller treats
 * it as succeeded, the same trust extended to a successful native fs::write.
 */
function saveViaFallback(name: string, content: string): SaveOutcome {
  downloadBlob(name, content, "text/markdown");
  return { ok: true, ref: { kind: "fallback", name } };
}

// --- Public surface ----------------------------------------------------------

export function openDocument(): Promise<OpenResult | null> {
  return hasFileSystemAccess ? openViaFsa() : openViaFallback();
}

export function saveDocument(
  ref: FileRef | null,
  content: string,
  opts: SaveOptions,
): Promise<SaveOutcome> {
  if (hasFileSystemAccess) return saveViaFsa(ref, content, opts);
  return Promise.resolve(
    saveViaFallback(ref?.name ?? opts.suggestedName, content),
  );
}

export function writeStandaloneFile(
  suggestedName: string,
  contents: string,
  mimeType: string,
): Promise<SaveOutcome> {
  if (hasFileSystemAccess) {
    return writeStandaloneViaFsa(suggestedName, contents);
  }
  downloadBlob(suggestedName, contents, mimeType);
  return Promise.resolve({
    ok: true,
    ref: { kind: "fallback", name: suggestedName },
  });
}

export function getAppVersion(): string {
  return __APP_VERSION__;
}

export const clipboard = {
  writeText: (text: string): Promise<void> =>
    navigator.clipboard.writeText(text),
  readText: (): Promise<string> => navigator.clipboard.readText(),
};

export function openExternal(url: string): void {
  if (/^(https?:|mailto:|tel:)/i.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
