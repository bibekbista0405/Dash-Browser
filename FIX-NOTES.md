DASH development startup and extension-manifest compatibility patch

Apply:
1. Close every running DASH/Electron process.
2. Extract this ZIP into the dash-monorepo root and allow the five source files to be overwritten.
3. From the repository root, run: npm run dev

What changed:
- Pin Vite development server to localhost:5173 with strictPort enabled.
- Normalize stale https://localhost VITE_DEV_SERVER_URL values to HTTP, matching Vite's configured plain-HTTP dev server.
- Use the same normalized URL for the main window and DASH internal tabs.
- Log the resolved development renderer URL to the DASH startup log.
- Detect invalid Manifest V3 extensions that declare background.scripts before passing them to Chromium. Such an extension is skipped at startup and its persisted registration is removed; its files are left untouched. Install a publisher-compatible build to use it again.

Validation:
- TypeScript transpile/syntax checks passed for all five modified TypeScript files.
- Full project typecheck/build was not run because node_modules are not included in the uploaded source archive.
