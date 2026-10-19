/* eslint-disable @typescript-eslint/no-unused-vars -- keeps the desktop module's signatures */
// Browser stand-in for the desktop app's spellcheck.ts, which draws its own
// underlines from the Windows spell checker via Tauri. The web editor leaves
// spellcheck off (CodeMirror's default); this only provides what the shared
// tablewidget.ts imports, so table cells stay consistent with it.
import { Facet } from "@codemirror/state";

/** Table cells match the editor: no browser spellcheck. */
export const cellSpellcheck = Facet.define<boolean, boolean>({
  combine: () => false,
});

/** No custom underlines to paint in the browser. */
export function paintMisspelledIn(_root: HTMLElement): void {}
