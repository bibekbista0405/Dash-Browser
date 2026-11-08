import { NEWTAB_CSS_MAX_LENGTH } from '../../shared/ipc-channels';
import { ThemeCssEditor, type ThemeTemplate } from './ThemeCssEditor';
import sweetDream from '../theme-presets/sweet-dream-newtab.css?raw';
import homeTemplate from '../theme-presets/newtab-template.css?raw';

const TEMPLATES: ThemeTemplate[] = [
  { name: 'Blank template', css: homeTemplate },
  { name: 'Sweet Dream', css: sweetDream },
  {
    name: 'Aurora',
    css: `/* Soft gradient background (tweaks the built-in look) */
.dash-home { background: radial-gradient(1200px 600px at 20% -10%, #3b2a7a55, transparent),
                         radial-gradient(900px 500px at 90% 10%, #0e7c8a44, transparent), var(--bg); }
.dash-logo { width: 110px; height: 110px; --logo-fill: linear-gradient(135deg, #8ab0ff, #c58bff); }
.dash-shortcut:hover { border-color: var(--accent); }`,
  },
  {
    name: 'Minimal',
    css: `/* Just the search box */
.dash-title, .dash-tagline { display: none; }
.dash-logo { width: 64px; height: 64px; opacity: .85; }`,
  },
  {
    name: 'Paper',
    css: `/* Warm paper look */
:root { --bg: #f6f1e7; --fg: #2b2620; --card: #ede6d6; --line: #d8cfba; --muted: #6b6254; --faint: #968c79; --accent: #b4532a; }
.dash-home { font-family: Georgia, 'Times New Roman', serif; }
.dash-search { border-radius: 10px; }`,
  },
];

const REFERENCE = `Page: .dash-home[data-theme="yourname"] — name it in your CSS, DASH reads it. No data-theme selector = tweak the built-in look.
Variables: --bg --fg --card --line --muted --faint --accent --logo-fill
Parts: .dash-branding .dash-logo .dash-title .dash-tagline .dash-search .dash-shortcuts .dash-shortcut .dash-shortcut-icon .dash-shortcut-label .dash-shortcut-add .dash-shortcut-remove .dash-restore .dash-empty .dash-theme-switcher
Effects: .dash-atmosphere .dash-light-orbs .dash-orb .dash-bubbles .dash-bubble .dash-cursor-glow .dash-particle-canvas .dash-sparkles .dash-sparkle`;

/** Settings → Appearance → Home page theme. */
export function NewTabAppearance() {
  return (
    <ThemeCssEditor
      cssKey="newTabCustomCss"
      enabledKey="newTabCustomCssEnabled"
      enableLabel="Use my theme on the home page"
      maxLength={NEWTAB_CSS_MAX_LENGTH}
      templates={TEMPLATES}
      reference={REFERENCE}
      applyMessage="Applied. Open home pages were refreshed. A Classic / Custom switch now appears at the bottom of the home page."
      note="Your CSS stays on this device and only styles DASH's own home page. It can't run scripts (CSS that links to online files will fetch them)."
    />
  );
}
