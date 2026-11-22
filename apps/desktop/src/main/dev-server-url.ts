/**
 * Resolve the renderer URL used by Vite during development.
 *
 * The desktop Vite config pins the renderer to http://127.0.0.1:5173.
 * vite-plugin-electron can expose VITE_DEV_SERVER_URL with an HTTPS scheme
 * inherited from the Windows environment. Do not use that scheme (or host)
 * to build the URL: this local Vite server is plain HTTP by configuration.
 * The environment variable is used only to distinguish dev from packaged mode.
 */
export function getDevServerUrl(): string | null {
  const configured = process.env.VITE_DEV_SERVER_URL?.trim();
  if (!configured) return null;

  if (/^https:\/\//i.test(configured)) {
    console.warn(
      `[DASH] Ignoring HTTPS VITE_DEV_SERVER_URL in development (${configured}); ` +
      'the configured Vite server uses HTTP.'
    );
  }

  return 'http://127.0.0.1:5173';
}
