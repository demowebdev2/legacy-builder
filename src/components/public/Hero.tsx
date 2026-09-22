import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/** Prototype `.hero`. The word in `emphasis` (if present in the title) is rendered gold. */
export function Hero({
  badge,
  badgeTone = "g",
  title,
  emphasis,
  body,
  children,
}: {
  badge?: string;
  badgeTone?: "g" | "a";
  title: string;
  emphasis?: string;
  body?: string;
  children?: ReactNode;
}) {
  let heading: ReactNode = title;
  if (emphasis && title.includes(emphasis)) {
    const [before, after] = title.split(emphasis);
    heading = (
      <>
        {before}
        <em>{emphasis}</em>
        {after}
      </>
    );
  }
  return (
    <section className="hero">
      <div className="pw" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {badge && (
          <span className={`badge badge-${badgeTone}`}>
            <Icon name="check" /> {badge}
          </span>
        )}
        <h1>{heading}</h1>
        {body && <p>{body}</p>}
        {children}
      </div>
    </section>
  );
}

/** Simple page intro used on content pages below the header (prototype pricing intro style). */
export function PageIntro({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 1.8rem" }}>
      <h1 className="h1">{title}</h1>
      {body && (
        <p className="sm" style={{ marginTop: ".6rem" }}>
          {body}
        </p>
      )}
      {children}
    </div>
  );
}
