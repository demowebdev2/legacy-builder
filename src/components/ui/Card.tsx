import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ children, className, style, as: As = "div" }: { children: ReactNode; className?: string; style?: CSSProperties; as?: "div" | "section" | "article" }) {
  return (
    <As className={cn("card", className)} style={style}>
      {children}
    </As>
  );
}

/** Card header: title (+ optional description) on the left, actions on the right. */
export function CardHeader({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = 3,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("card-hd", className)}>
      {children ?? (
        <div>
          {title && <H className="h3">{title}</H>}
          {description && <p className="sm">{description}</p>}
        </div>
      )}
      {actions}
    </div>
  );
}

export function CardBody({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("card-bd", className)} style={style}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card-ft", className)}>{children}</div>;
}
