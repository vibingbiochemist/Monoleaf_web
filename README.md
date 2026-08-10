# Monoleaf Web

**The same portable Markdown editor as [Monoleaf](https://github.com/vibingbiochemist/Monoleaf), running entirely in your browser tab.**

No install, no account, no server. Open a `.md` file, edit it with live
preview, save it back, export to PDF or HTML, all without the file ever
leaving your machine.

[**monoleaf.org**](https://monoleaf.org) · [Report an issue](https://github.com/vibingbiochemist/Monoleaf_web/issues)

## What this is

Monoleaf is normally a Tauri desktop app. Its editor, though, is already
plain web technology (CodeMirror 6, `markdown-it`, KaTeX, Paged.js), sitting
behind a thin layer that talks to Tauri for file dialogs, the clipboard and a
few other native services. This repository is that same editor with the
Tauri layer swapped for a browser one: the shared editing code is copied
over untouched, and a single new module, `src/platform.ts`, does everything
the desktop app did through Tauri, using only standard browser APIs.

It is a separate, standalone project on purpose, not a page bolted onto
[monoleaf.org](https://github.com/vibingbiochemist/Monoleaf_website): it
builds to a self-contained bundle that the website can embed, and that any
other site could embed the same way.

## Versioning

`package.json`'s version tracks the desktop app's, not this repo's own change
history: it is bumped when the shared editor code here is re-synced from a
`Monoleaf` release, not for changes local to this repo (a platform-adapter
fix, a UI tweak like the toolbar logo). The two numbers meaning the same
thing is the point, since this is the same editor, not a separate product
with its own roadmap. Displayed in-app under the ⓘ button.

## Privacy

- **No cookies, no account, no server.** This is a static page; there is
  nothing to send your document to, and nothing for a server to log even if
  there were.
- **Your document never leaves the browser.** Opening, editing, saving and
  exporting all happen client-side, either through the File System Access
  API (Chromium browsers) or a plain upload/download (Firefox, Safari).
- A few small things (your display name, your theme and view preferences,
  a short-lived crash-recovery snapshot) are kept in the browser's
  `localStorage`, purely for your convenience. None of it is a cookie, and
  none of it is ever transmitted anywhere. This is stated in-app too, under
  the ⓘ button.

## What's different from the desktop app

Most of the editor is identical: formatting, tables, math, footnotes,
comments, tracked changes, page setup, PDF and HTML export all work exactly
as they do on Windows. A few things don't carry over, because they depend on
the operating system or on Tauri's own plumbing:

| Desktop feature                          | On the web                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Save writes back to the open file        | Only in Chromium browsers (File System Access API). Firefox and Safari download a new file instead of overwriting in place.           |
| PDF import                               | Not available. Converting a PDF's page geometry to Markdown is desktop-only for now.                                                  |
| Native spell-check ("Add to dictionary") | Not available. The browser's own spell-check underlines misspellings instead.                                                         |
| In-app updates                           | Not applicable. A deployed page is always the current version.                                                                        |
| "Reopen last file" on launch             | Not available. There is no persistent handle to a file across browser sessions.                                                       |
| Closing with unsaved changes             | The browser's generic "leave site?" prompt, not the app's Save / Don't save / Cancel dialog (browsers don't allow a custom one here). |
| Multiple windows                         | Not applicable. A browser tab is one document; File ▸ New or Open while a document is dirty asks first, the same way closing would.   |

Everything else, including the byte-for-byte round-trip guarantee (BOMs,
CRLF/CR/LF, missing trailing newlines all survive an open-and-save
untouched), is unchanged and tested.

## Run it

Requires Node and npm. No Rust toolchain, no native dependencies.

```bash
npm install
npm run dev          # dev server with hot reload
npm run build         # production build, output in dist/
npm run preview       # serve the production build locally
```

## Development

Everything a change has to pass:

```bash
npx tsc --noEmit       # type-check
npm run lint            # ESLint
npm run format:check    # Prettier
npm test                 # Vitest
```

Key modules: `src/main.ts` (wiring), `src/platform.ts` (the browser
File I/O adapter, the one module with no desktop-app equivalent),
`src/document.ts` (byte-exact round-trip load/serialize), `src/recovery.ts`
(crash-recovery drafts), `src/export.ts` (PDF/HTML rendering).

`src/platform.browser.test.ts` covers the adapter directly: a BOM'd,
CRLF-line-ended fixture round-tripping through `decodeFile` byte-for-byte is
the single most important test in this repository, since it's the one
guarantee inherited from the desktop app that had to be reimplemented rather
than just copied.

## License

Released under the [MIT License](LICENSE), same as the desktop app.

Third-party dependencies and their licenses are listed in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (also viewable in-app via
the ⓘ button), generated with `npm run licenses`.
