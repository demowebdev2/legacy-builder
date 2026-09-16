"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

/** Re-runs the live engine for one lead and reports the real outcome (prototype `requeue`). */
export function useRequeue() {
  const requeue = useMutation(api.leads.requeue);
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const run = useCallback(
    async (leadId: Id<"leads">, reference: string) => {
      setPendingId(leadId);
      try {
        const result = await requeue({ leadId });
        if (result.outcome === "assigned" || result.outcome === "partial") {
          toast.success(
            result.outcome === "assigned" ? `${reference} assigned` : `${reference} partly filled`,
            `${result.assigned.join(", ")} — one lead drawn from each balance.${result.outcome === "partial" ? " The remaining slots stay on the retry ladder." : ""}`,
          );
        } else if (result.outcome === "held") {
          toast.warn("Held in the queue", "Distribution is switched off. The lead keeps its place and releases when the queue is released.");
        } else if (result.outcome === "none") {
          toast.warn("Still nobody eligible", result.reason ?? "No account passed every rule. Open the simulator to see which rule stops each account.");
        } else {
          toast.warn("Not re-queued", result.reason ?? "The lead is not in a state the engine can release.");
        }
        return result;
      } catch (error) {
        toast.error(error, "Could not re-queue");
        return undefined;
      } finally {
        setPendingId(null);
      }
    },
    [requeue, toast],
  );

  return [run, pendingId] as const;
}
