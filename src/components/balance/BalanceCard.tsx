import { Meter } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";

/** Prototype `balanceTile(type)`: remaining of issued, meter colour by percentage, "no expiry". */
export function BalanceCard({ type, remaining, issued }: { type: "exclusive" | "standard"; remaining: number; issued: number }) {
  const off = issued === 0;
  const pct = issued ? Math.round((remaining / issued) * 100) : 0;
  const label = type === "exclusive" ? "Exclusive" : "Standard";
  const desc = type === "exclusive" ? "High-intent sources" : "Prospecting campaigns";
  return (
    <div className={cn("crd", off && "off")}>
      <div className="t">{label}</div>
      <div className="v">
        {off ? "—" : remaining}
        {!off && <small> of {issued} received</small>}
      </div>
      <div className="xs">{off ? "None purchased yet" : `${desc} · no expiry`}</div>
      {!off && <Meter percent={pct} tone={pct < 20 ? "red" : pct < 40 ? "amber" : "gold"} />}
    </div>
  );
}
