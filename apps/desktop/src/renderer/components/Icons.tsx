import type { ReactNode } from 'react';

/**
 * One consistent stroke-icon set for the toolbar. Text glyphs (⬇ ⚙ ▤ ⌂) draw at different sizes and weights on
 * every OS font, and some turn into colour emoji on Windows; SVG strokes follow `currentColor` in both themes.
 */
function Svg({ children, size = 16, filled = false }: { children: ReactNode; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconBack = () => <Svg><path d="M15 6l-6 6 6 6" /></Svg>;
export const IconForward = () => <Svg><path d="M9 6l6 6-6 6" /></Svg>;
export const IconReload = () => <Svg><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></Svg>;
export const IconStop = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconHome = () => <Svg><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></Svg>;
export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <Svg filled={filled}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></Svg>
);
export const IconDownload = () => <Svg><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></Svg>;
export const IconBookmarks = () => <Svg><path d="M7 4h10v16l-5-3.5L7 20z" /></Svg>;
export const IconHistory = () => <Svg><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v5h5" /><path d="M12 8v4l3 2" /></Svg>;
export const IconSettings = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const IconMore = () => (
  <Svg filled><circle cx="12" cy="5.5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="18.5" r="1.4" /></Svg>
);
export const IconShield = ({ size = 12 }: { size?: number }) => (
  <Svg size={size}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></Svg>
);
