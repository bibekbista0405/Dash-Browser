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
export const IconPalette = () => <Svg><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.4-1.1-2.5 0-.9.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></Svg>;
export const IconNetwork = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></Svg>;
export const IconKey = () => <Svg><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></Svg>;
export const IconAccess = () => <Svg><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8.5l7 1.5 7-1.5M12 10v5m0 0l-3 5m3-5l3 5" /></Svg>;
export const IconZap = () => <Svg><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" /></Svg>;
export const IconPuzzle = () => <Svg><path d="M9 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H5v-4h2a2 2 0 1 0 0-4H5V6h4z" /></Svg>;
export const IconSwap = () => <Svg><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></Svg>;
export const IconInfo = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IconPrivate = ({ size = 16 }: { size?: number }) => <Svg size={size}><path d="M3 11h18" /><path d="M5 11l1.5-5h11L19 11" /><circle cx="8" cy="16" r="2.5" /><circle cx="16" cy="16" r="2.5" /><path d="M10.5 16h3" /></Svg>;
export const IconMoon = ({ size = 12 }: { size?: number }) => <Svg size={size}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>;
export const IconMute = ({ size = 12 }: { size?: number }) => <Svg size={size}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l4 6M21 9l-4 6" /></Svg>;
export const IconLock = ({ size = 12 }: { size?: number }) => <Svg size={size}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const IconFolder = ({ size = 14 }: { size?: number }) => <Svg size={size}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>;
