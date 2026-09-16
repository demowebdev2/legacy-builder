import { Reveal } from "./Reveal";

/** Renders the structured CMS `sections` (heading + body) as prototype cards. */
export function CmsSections({ sections, className = "g g2", style }: { sections: ReadonlyArray<{ heading: string; body: string }>; className?: string; style?: React.CSSProperties }) {
  if (!sections.length) return null;
  return (
    <div className={className} style={style}>
      {sections.map((s, i) => (
        <Reveal key={`${s.heading}-${i}`} index={i} className="card card-p">
          <h2 className="h4" style={{ marginBottom: ".3rem" }}>
            {s.heading}
          </h2>
          <p className="sm" style={{ whiteSpace: "pre-line" }}>
            {s.body}
          </p>
        </Reveal>
      ))}
    </div>
  );
}
