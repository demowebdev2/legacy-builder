import { ConvexError } from "convex/values";

/** Extracts the user-facing message from a Convex error (`ConvexError<{code,message}>`) or any error. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
  }
  if (error instanceof Error) {
    // Convex wraps server errors: "[Request ID: …] Server Error\nUncaught Error: message"
    const match = /Uncaught (?:ConvexError|Error): (.+?)(?:\n|$)/.exec(error.message);
    if (match) return match[1];
    if (!/Server Error/.test(error.message)) return error.message;
  }
  return fallback;
}

export function errorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (data && typeof data === "object" && "code" in data) return String((data as { code: unknown }).code);
  }
  return null;
}
