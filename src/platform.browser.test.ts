// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  decodeFile,
  saveDocument,
  writeToHandle,
  hasFileSystemAccess,
} from "./platform";

function fakeHandle(overrides: Partial<FileSystemFileHandle> = {}) {
  const writes: Uint8Array[] = [];
  const handle = {
    kind: "file" as const,
    name: "doc.md",
    getFile: vi.fn(),
    createWritable: vi.fn(async () => ({
      write: vi.fn(async (data: BufferSource) => {
        writes.push(new Uint8Array(data as ArrayBuffer));
      }),
      close: vi.fn(async () => {}),
    })),
    queryPermission: vi.fn(async () => "granted" as const),
    requestPermission: vi.fn(async () => "granted" as const),
    ...overrides,
  };
  return { handle: handle as unknown as FileSystemFileHandle, writes };
}

describe("byte-exact round trip", () => {
  it("decodeFile preserves a BOM, CRLF, and no trailing newline exactly", async () => {
    // BOM + CRLF line endings + trailing spaces + no trailing newline: the
    // same set of properties the desktop app's Rust round-trip test covers.
    const original = "﻿Line one\r\nLine two \r\nLine three";
    const bytes = new TextEncoder().encode(original);
    const file = new File([bytes], "fixture.md", { type: "text/markdown" });

    const decoded = await decodeFile(file);
    expect(decoded).toBe(original);

    const reEncoded = new TextEncoder().encode(decoded);
    expect(Array.from(reEncoded)).toEqual(Array.from(bytes));
  });

  it("rejects a file that is not valid UTF-8", async () => {
    // A lone continuation byte (0x80) is invalid as the start of any UTF-8
    // sequence, so strict decoding must fail rather than silently replace it.
    const file = new File([new Uint8Array([0x80, 0x81])], "bad.md");
    await expect(decodeFile(file)).rejects.toThrow(/not valid UTF-8/);
  });
});

describe("writeToHandle: File System Access permission handling", () => {
  it("proceeds without prompting when permission is already granted", async () => {
    const { handle } = fakeHandle();
    const outcome = await writeToHandle(handle, "content");
    expect(outcome.ok).toBe(true);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.createWritable).toHaveBeenCalled();
  });

  it("re-requests a lapsed permission and proceeds once regranted", async () => {
    const { handle } = fakeHandle({
      queryPermission: vi.fn(async () => "prompt" as const),
      requestPermission: vi.fn(async () => "granted" as const),
    });
    const outcome = await writeToHandle(handle, "content");
    expect(outcome.ok).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledWith({
      mode: "readwrite",
    });
    expect(handle.createWritable).toHaveBeenCalled();
  });

  it("surfaces denied permission as a catchable error, without writing", async () => {
    const { handle } = fakeHandle({
      queryPermission: vi.fn(async () => "prompt" as const),
      requestPermission: vi.fn(async () => "denied" as const),
    });
    const outcome = await writeToHandle(handle, "content");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.reason === "error") {
      expect(outcome.error).toBeInstanceOf(Error);
    }
    expect(handle.createWritable).not.toHaveBeenCalled();
  });

  it("writes the exact bytes passed in, not a re-encoded approximation", async () => {
    const { handle, writes } = fakeHandle();
    const content = "﻿a\r\nb"; // BOM + CRLF
    await writeToHandle(handle, content);
    expect(writes).toHaveLength(1);
    expect(Array.from(writes[0])).toEqual(
      Array.from(new TextEncoder().encode(content)),
    );
  });
});

describe("saveDocument: fallback backend (no File System Access API)", () => {
  it("is the active backend in jsdom", () => {
    expect(hasFileSystemAccess).toBe(false);
  });

  it("downloads a Blob carrying the exact bytes passed in", async () => {
    const content = "﻿Line one\r\nLine two";
    let capturedBlob: Blob | null = null;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:fake";
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      const outcome = await saveDocument(null, content, {
        suggestedName: "doc.md",
        forcePrompt: false,
      });
      expect(outcome.ok).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
      expect(capturedBlob).not.toBeNull();
      const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
      expect(Array.from(bytes)).toEqual(
        Array.from(new TextEncoder().encode(content)),
      );
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      clickSpy.mockRestore();
    }
  });
});
