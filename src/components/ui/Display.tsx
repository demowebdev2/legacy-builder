import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";
import { Meter } from "./Feedback";

/** Prototype `.dl` definition list. Pass [term, description] pairs; falsy rows are skipped. */
export function DefinitionList({ items, className, style }: { items: Array<[ReactNode, ReactNode] | null | false>; className?: string; style?: React.CSSProperties }) {
  return (
    <dl className={cn("dl", className)} style={style}>
      {items.filter(Boolean).map((row, i) => {
        const [term, desc] = row as [ReactNode, ReactNode];
        return (
          <div key={i} className="contents">
            <dt>{term}</dt>
            <dd>{desc}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export interface TimelineItem {
  key: string | number;
  tone?: "ok" | "warn" | "bad" | "now";
  time?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="tl">
      {items.map((it) => (
        <li key={it.key} className={cn("tli", it.tone)}>
          {it.time && <time>{it.time}</time>}
          <h5>{it.title}</h5>
          {it.body && <p className="sm">{it.body}</p>}
        </li>
      ))}
    </ol>
  );
}

export function CheckList({ items }: { items: Array<{ text: ReactNode; ok?: boolean }> }) {
  return (
    <ul className="plist">
      {items.map((it, i) => (
        <li key={i} className={it.ok === false ? "no" : undefined}>
          <Icon name={it.ok === false ? "x" : "check"} />
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Prototype `statTile`. `href` makes the whole tile a link. */
export function StatCard({
  label,
  value,
  unit,
  icon,
  sub,
  accent,
  meter,
  meterTone,
  href,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  icon?: IconName;
  sub?: ReactNode;
  accent?: "gold" | "green" | "red" | "blue" | null;
  meter?: number | null;
  meterTone?: "gold" | "green" | "red" | "amber";
  href?: string;
}) {
  const inner = (
    <>
      <div className="lab">
        {icon && <Icon name={icon} />}
        {label}
      </div>
      <div className="val">
        {value}
        {unit != null && <small> {unit}</small>}
      </div>
      {sub && <div className="sub">{sub}</div>}
      {meter != null && <Meter percent={meter} tone={meterTone} />}
    </>
  );
  const className = cn("stat", accent && `acc-${accent}`, href && "clk");
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/** Prototype table wrapper (`.card > .tw > table.t`). */
export function DataTable({
  columns,
  children,
  footer,
  empty,
  isEmpty,
  caption,
  flush,
}: {
  columns: Array<{ label: ReactNode; align?: "right"; width?: string; srOnly?: boolean }>;
  children: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
  caption?: string;
  flush?: boolean;
}) {
  const table = isEmpty ? (
    empty
  ) : (
    <div className="tw">
      <table className="t">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cn(c.align === "right" && "tr")} style={c.width ? { width: c.width } : undefined}>
                {c.srOnly ? <span className="sr-only">{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
  if (flush) return <>{table}{footer}</>;
  return (
    <div className="card">
      {table}
      {footer}
    </div>
  );
}

export function IconBox({ icon, tone }: { icon: IconName; tone: "amber" | "red" | "blue" | "green" | "soft" }) {
  const map = {
    amber: ["var(--amber-wash)", "var(--amber)"],
    red: ["var(--red-wash)", "var(--red)"],
    blue: ["var(--blue-wash)", "var(--blue)"],
    green: ["var(--green-wash)", "var(--green)"],
    soft: ["var(--soft-2)", "var(--gray)"],
  } as const;
  return (
    <div className="iconbox" style={{ background: map[tone][0], color: map[tone][1] }}>
      <Icon name={icon} />
    </div>
  );
}
