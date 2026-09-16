/** The Legacy Builders shield-and-house mark from the prototype. `tone` sets the inner fill. */
export function LogoMark({
  tone = "navy",
  arrow = false,
  width = 28,
  height = 34,
  className,
}: {
  tone?: "navy" | "dark";
  arrow?: boolean;
  width?: number;
  height?: number;
  className?: string;
}) {
  const inner = tone === "dark" ? "#071A2F" : "#0B2440";
  return (
    <svg viewBox="0 0 40 48" width={width} height={height} className={className} aria-hidden="true" focusable="false">
      <path d="M20 1.5 37.5 8v17.5C37.5 36 30.2 44.5 20 46.8 9.8 44.5 2.5 36 2.5 25.5V8L20 1.5Z" fill="#C89B3C" />
      <path d="M20 5.2 34 10.4v15.1C34 34 28.2 40.9 20 43 11.8 40.9 6 34 6 25.5V10.4L20 5.2Z" fill={inner} />
      <path d="M20 16.8 27.6 23v9.4H12.4V23L20 16.8Z" fill="#C89B3C" />
      <rect x="15.6" y="25.4" width="3" height="7" fill={inner} />
      <rect x="21.4" y="25.4" width="3" height="7" fill={inner} />
      {arrow && (
        <path d="M20 10.6v4.6M17.8 12.8 20 10.5l2.2 2.3" stroke="#E8C26A" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
