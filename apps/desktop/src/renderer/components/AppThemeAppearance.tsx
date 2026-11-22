import { APP_CSS_MAX_LENGTH } from '../../shared/ipc-channels';
import { ThemeCssEditor, type ThemeTemplate } from './ThemeCssEditor';
import browserTemplate from '../theme-presets/browser-template.css?raw';
import sweetDream from '../theme-presets/sweet-dream-browser.css?raw';

const TEMPLATES: ThemeTemplate[] = [
  { name: 'Blank template', css: browserTemplate },
  { name: 'Sweet Dream', css: sweetDream },
  {
    name: 'Ocean',
    css: `.dark { --color-surface: 8 18 28; --color-surface-elevated: 14 30 44; --color-surface-hover: 22 44 62; --color-border: 30 58 80; --color-accent: 56 189 248; }
.light { --color-surface: 240 249 255; --color-surface-elevated: 255 255 255; --color-surface-hover: 224 242 254; --color-border: 186 230 253; --color-accent: 2 132 199; }`,
  },
  {
    name: 'Forest',
    css: `.dark { --color-surface: 10 18 14; --color-surface-elevated: 18 30 24; --color-surface-hover: 28 46 36; --color-border: 40 64 50; --color-accent: 74 222 128; }
.light { --color-surface: 245 252 247; --color-surface-elevated: 255 255 255; --color-surface-hover: 226 244 232; --color-border: 195 225 205; --color-accent: 22 163 74; }`,
  },
];

const REFERENCE = `Colour variables ("R G B" triplets, e.g. 91 140 255), set under .dark and/or .light:
--color-surface --color-surface-elevated --color-surface-hover --color-border --color-accent --color-text-primary --color-text-secondary --color-text-tertiary
Anything else is plain CSS and applies to the toolbar, tab strip, menus, panels and the History / Downloads / Bookmarks / Settings pages.`;

/** Settings → Appearance → Browser theme: colours and styling for the whole browser UI. */
export function AppThemeAppearance() {
  return (
    <ThemeCssEditor
      cssKey="appCustomCss"
      enabledKey="appCustomCssEnabled"
      enableLabel="Use my theme on the browser"
      maxLength={APP_CSS_MAX_LENGTH}
      templates={TEMPLATES}
      reference={REFERENCE}
      applyMessage="Applied to the browser right away."
      note="Applies to DASH's own interface only, never to the websites you visit. If a theme makes something unreadable, untick the box above or press Reset."
    />
  );
}
