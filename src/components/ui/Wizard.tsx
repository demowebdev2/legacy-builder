import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <>
      <div className="prog" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`Step ${step} of ${total}`}>
        <i style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <div className="stepnote">
        Step {step} of {total}
      </div>
    </>
  );
}

/** Prototype `.opt` selectable card. */
export function OptionCard({
  selected,
  onSelect,
  icon,
  badge,
  title,
  description,
  disabled,
  style,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: IconName;
  badge?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button type="button" className={cn("opt", selected && "sel")} aria-pressed={selected} onClick={onSelect} disabled={disabled} style={style}>
      <span className="opt-ic">{icon ? <Icon name={icon} /> : badge}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{title}</b>
        {description && <span>{description}</span>}
      </span>
    </button>
  );
}
