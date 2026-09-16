"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Wraps a Convex mutation/action call with pending state and error toasts.
 *   const [run, pending] = useAction(async () => updatePrefs({...}), { success: "Preferences saved" });
 */
export function useAction<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: { success?: string | ((result: Result) => string); successBody?: string; errorTitle?: string } = {},
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args: Args): Promise<Result | undefined> => {
      setPending(true);
      try {
        const result = await fn(...args);
        if (options.success) {
          toast.success(typeof options.success === "function" ? options.success(result) : options.success, options.successBody);
        }
        return result;
      } catch (error) {
        toast.error(error, options.errorTitle);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, toast, options.success, options.successBody, options.errorTitle],
  );
  return [run, pending] as const;
}
