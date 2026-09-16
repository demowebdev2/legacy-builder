import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { PURCHASE_MINIMUM } from "@/domain/constants";

export type PublicReference = FunctionReturnType<typeof api.referenceData.publicData>;
export type PublishedLegalDoc = FunctionReturnType<typeof api.legalDocuments.published>;

export type EntityType = "individual" | "agency";

export interface LicenceRow {
  licenseNumber: string;
  expiresOn: string;
}

/** Non-secret wizard state. Passwords are never part of this object (it is persisted to sessionStorage). */
export interface ApplicationData {
  entityType: "" | EntityType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  businessName: string;
  ein: string;
  producerCount: string;
  npn: string;
  residentState: string;
  licensedStates: string[];
  licences: Record<string, LicenceRow>;
  eoCarrier: string;
  eoPolicyNumber: string;
  eoExpiresOn: string;
  coverageTypes: string[];
  dailyPace: number;
  seats: number;
  requestTpmo: boolean;
  tpmoAttested: boolean;
  quantity: number;
  autoReload: boolean;
  agreeLicensed: boolean;
  agreeContactLaw: boolean;
  agreeTerms: boolean;
}

export const EMPTY_APPLICATION: ApplicationData = {
  entityType: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  businessName: "",
  ein: "",
  producerCount: "",
  npn: "",
  residentState: "",
  licensedStates: [],
  licences: {},
  eoCarrier: "",
  eoPolicyNumber: "",
  eoExpiresOn: "",
  // prototype defaults
  coverageTypes: ["life", "mortgage", "final"],
  dailyPace: 5,
  seats: 1,
  requestTpmo: false,
  tpmoAttested: false,
  quantity: PURCHASE_MINIMUM,
  autoReload: true,
  agreeLicensed: false,
  agreeContactLaw: false,
  agreeTerms: false,
};

export const STEP_TITLES = ["Entity", "Details", "Licensing", "Preferences", "Purchase", "Review"] as const;
export const TOTAL_STEPS = STEP_TITLES.length;

/** prototype `[3,5,8,12,20]` */
export const PACE_OPTIONS = [3, 5, 8, 12, 20] as const;
/** prototype agency seat choices */
export const SEAT_OPTIONS = [2, 3, 5, 8, 12, 25] as const;

/** "YYYY-MM-DD" → epoch ms at 23:59 local time on that day. */
export function endOfDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d, 23, 59, 0, 0).getTime();
}

export function localDateString(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateInput(date: string): string {
  const t = endOfDay(date);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type SetField = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => void;
