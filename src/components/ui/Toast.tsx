"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { Icon } from "./Icon";

type ToastKind = "ok" | "bad" | "warn" | "info";
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  kind: ToastKind;
}

interface ToastApi {
  toast: (title: string, body?: string, kind?: ToastKind) => void;
  success: (title: string, body?: string) => void;
  warn: (title: string, body?: string) => void;
  error: (error: unknown, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback((title: string, body?: string, kind: ToastKind = "info") => {
    const id = ++seq.current;
    setItems((list) => [...list, { id, title, body, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4500);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, body) => toast(title, body, "ok"),
      warn: (title, body) => toast(title, body, "warn"),
      error: (error, title = "That action failed") => toast(title, errorMessage(error), "bad"),
    }),
    [toast],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="tz" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn("toast", t.kind !== "info" && t.kind)}>
            <Icon name={t.kind === "bad" ? "warn" : t.kind === "warn" ? "info" : "check"} />
            <div>
              <b>{t.title}</b>
              {t.body && <span>{t.body}</span>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
