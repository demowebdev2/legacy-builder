"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Prototype modal (`.mw/.mo`): blurred backdrop, sticky header/footer, wide variant. Adds a focus trap,
 * Escape to close, focus restore and `role="dialog"` with labelled title.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>("input,select,textarea") ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab" && box) {
        const nodes = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!nodes.length) return;
        const firstNode = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === firstNode) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && document.activeElement === lastNode) {
          e.preventDefault();
          firstNode.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="mw">
      <div className="bd" onClick={onClose} aria-hidden="true" />
      <div className={cn("mo", wide && "wide")} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={boxRef}>
        <div className="mo-hd">
          <div>
            <h3 className="h3" id={titleId}>
              {title}
            </h3>
            {subtitle && (
              <p className="sm" style={{ marginTop: ".2rem" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="mo-bd">{children}</div>
        {footer && <div className="mo-ft">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
