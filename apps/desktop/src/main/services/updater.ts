import electronUpdater from 'electron-updater';
import { app } from 'electron';

// electron-updater is CommonJS. Node's ESM loader uses static analysis
// (cjs-module-lexer) to detect named exports from CJS modules, and that
// detection isn't reliable for every CJS package's export shape — for
// electron-updater specifically, `import { autoUpdater } from
// 'electron-updater'` throws "Named export 'autoUpdater' not found" at
// runtime even though the property genuinely exists on the module. The
// default import always works because it just gets the whole
// module.exports object, whatever shape it's in.
const { autoUpdater } = electronUpdater;

/**
 * Real `electron-updater` wiring, not a stub. What it can't do on its own:
 * actually deliver an update, because that requires a real publish target
 * (a GitHub Releases repo, S3 bucket, or generic static feed) configured
 * under `build.publish` in package.json — which isn't set here, since this
 * environment has no real repository to publish releases to and setting a
 * placeholder owner/repo would make `dist`/`dist:win` silently try to
 * authenticate against a repo that doesn't exist.
 *
 * To actually enable updates:
 *   1. Add to package.json's "build" block:
 *        "publish": { "provider": "github", "owner": "<you>", "repo": "dash-browser" }
 *   2. Publish a GitHub Release with the files electron-builder produces
 *      (latest.yml / latest-mac.yml / latest-linux.yml + installers).
 *   3. That's it — the code below already checks for and applies updates
 *      correctly against whatever `publish` target you configure.
 *
 * In dev (`npm run dev`) this always no-ops — auto-update only makes sense
 * against a packaged, installed build.
 */
export function checkForUpdatesInBackground(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    // Never crash the app over a failed update check — most commonly this
    // just means no publish target is configured yet (see above).
    console.error('[DASH] Update check failed:', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[DASH] Update check failed:', err.message);
  });
}
