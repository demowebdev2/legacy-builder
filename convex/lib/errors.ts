import { ConvexError } from "convex/values";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "MFA_REQUIRED"
  | "MFA_SETUP_REQUIRED"
  | "NOT_FOUND"
  | "INVALID"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INSUFFICIENT_BALANCE"
  | "READ_ONLY"
  | "PAYMENT_FAILED"
  | "CONFIGURATION";

export type AppErrorData = { code: AppErrorCode; message: string };

export function appError(code: AppErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError({ code, message });
}

export const unauthenticated = () => appError("UNAUTHENTICATED", "Please sign in to continue.");
export const forbidden = (message = "You do not have permission to do that.") => appError("FORBIDDEN", message);
export const notFound = (what = "Record") => appError("NOT_FOUND", `${what} not found.`);
export const invalid = (message: string) => appError("INVALID", message);
export const conflict = (message: string) => appError("CONFLICT", message);
