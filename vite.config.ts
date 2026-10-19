import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // @vscode/markdown-it-katex is a CJS module with `exports.default = fn`
  // behind an `__esModule` marker. Vite 8's Rolldown-based interop (aligned
  // to esbuild) fails to unwrap it, so `import katexPlugin from "..."` gets
  // the whole exports object instead of the function, and markdown-it's
  // `.use()` throws "plugin.apply is not a function" the moment a document is
  // rendered for pagination/export. This opts back into the pre-Vite-8 (Rollup
  // commonjs plugin) interop behavior, which handles it correctly. See the
  // Vite 8 migration guide's note on `inconsistentCjsInterop`.
  legacy: {
    inconsistentCjsInterop: true,
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    // These suites in the shared livepreview.test.ts drive the desktop app's
    // disk-image loading through a mocked Tauri invoke; here localimages.ts
    // is a browser stub that never loads anything. Skipped by name because
    // the shared test file must stay a verbatim copy.
    testNamePattern:
      /^(?!(local image widgets|local image lookup by name|saving resolves a previously-unresolvable local image|loadFailureCount: retries a failure) )/,
  },
});
