import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "navy" | "gold" | "out" | "ghost" | "red" | "green";
export type ButtonSize = "xs" | "s" | "md" | "lg";

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: IconName;
  iconRight?: IconName;
}

export function buttonClass({ variant = "navy", size = "md", full }: StyleProps, className?: string) {
  return cn("b", `b-${variant}`, size !== "md" && `b-${size}`, full && "b-full", className);
}

function Content({ icon, iconRight, loading, children }: { icon?: IconName; iconRight?: IconName; loading?: boolean; children?: ReactNode }) {
  return (
    <>
      {loading ? <span className="spin" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </>
  );
}

export function Button({
  variant,
  size,
  full,
  icon,
  iconRight,
  loading,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: StyleProps & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, full }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  full,
  icon,
  iconRight,
  className,
  children,
  ...rest
}: StyleProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, full }, className)} {...rest}>
      <Content icon={icon} iconRight={iconRight}>
        {children}
      </Content>
    </Link>
  );
}

export function ButtonRow({ children, className, end }: { children: ReactNode; className?: string; end?: boolean }) {
  return <div className={cn("b-row", end && "justify-end", className)}>{children}</div>;
}
