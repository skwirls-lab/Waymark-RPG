import logoSvg from '../../site/src/logo.svg?raw';

/** The Waymark mark, shared with the rules site so the two never drift apart. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="logo"
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}
