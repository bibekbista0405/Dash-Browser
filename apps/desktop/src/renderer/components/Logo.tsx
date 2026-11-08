import logoMark from '../assets/logo-mark.png';

/**
 * The DASH logo (derived from the app icon). Drawn as a CSS mask so it takes
 * the surrounding text colour and stays crisp in both themes.
 */
export function Logo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="DASH"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        width: size,
        height: size,
        WebkitMask: `url(${logoMark}) center / contain no-repeat`,
        mask: `url(${logoMark}) center / contain no-repeat`,
      }}
    />
  );
}
