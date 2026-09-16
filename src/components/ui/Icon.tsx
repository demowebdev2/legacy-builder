import type { ReactNode, SVGProps } from "react";

/** The prototype's SVG sprite as typed React icons (24×24, stroke-based). */
const PATHS = {
  shield: <path d="M12 2 4 5v7c0 5 3.5 8.8 8 10 4.5-1.2 8-5 8-10V5l-8-3Z" strokeLinecap="round" strokeLinejoin="round" />,
  home: <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" strokeLinecap="round" strokeLinejoin="round" />,
  heart: <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1Z" strokeLinecap="round" strokeLinejoin="round" />,
  chart: <path d="M3 3v18h18M7 15l4-5 3 3 5-7" strokeLinecap="round" strokeLinejoin="round" />,
  cross: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" strokeLinecap="round" strokeLinejoin="round" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  check: <path d="m4 12 5.5 5.5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />,
  x: <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  back: <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
  badge: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="m8.5 13.5-1.5 8 5-3 5 3-1.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 20a6.6 6.6 0 0 0-2-4.7" strokeLinecap="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </>
  ),
  bank: <path d="M3 9 12 4l9 5M5 9v9m4-9v9m6-9v9m4-9v9M3 20h18" strokeLinecap="round" strokeLinejoin="round" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.3 2" strokeLinecap="round" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6v.4" strokeLinecap="round" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17.2v.3" strokeLinecap="round" />
    </>
  ),
  phone: <path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z" strokeLinejoin="round" />,
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" />
    </>
  ),
  bell: <path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M13.7 20a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />,
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" strokeLinecap="round" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" strokeLinejoin="round" />,
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M2.5 10h19" strokeLinecap="round" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinejoin="round" />
      <path d="M14 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" strokeLinecap="round" />
    </>
  ),
  flow: (
    <>
      <rect x="3" y="3" width="6" height="5" rx="1.3" />
      <rect x="15" y="3" width="6" height="5" rx="1.3" />
      <rect x="9" y="16" width="6" height="5" rx="1.3" />
      <path d="M6 8v3h12V8M12 11v5" strokeLinecap="round" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" strokeLinecap="round" />
    </>
  ),
  mega: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" strokeLinejoin="round" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
    </>
  ),
  out: <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M11 12h10M18 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />,
  refresh: <path d="M20 11a8 8 0 1 0-.7 4.3M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />,
  play: <path d="M7 4.5 19 12 7 19.5v-15Z" strokeLinejoin="round" />,
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </>
  ),
  trend: <path d="m3 16 5.5-5.5 3.5 3.5L21 5M16 5h5v5" strokeLinecap="round" strokeLinejoin="round" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" strokeLinecap="round" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 4.5h13l2.5 8.5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8.5Z" strokeLinejoin="round" />
    </>
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" strokeLinejoin="round" />,
  edit: <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" strokeLinejoin="round" />,
  eye: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function isIconName(name: string): name is IconName {
  return name in PATHS;
}

export function Icon({ name, size = 16, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      className={["ico", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
