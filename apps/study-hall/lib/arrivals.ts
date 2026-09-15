import { z } from "zod";
import { getKstTodayYmd, normalizeYmdDate, normalizeYmMonth } from "@/lib/date-utils";

export const arrivalDateSchema = z.string().refine((v) => { try { normalizeYmdDate(v); return true; } catch { return false; } }, "날짜를 확인해 주세요.");
export const arrivalMonthSchema = z.string().refine((v) => { try { normalizeYmMonth(v); return true; } catch { return false; } }, "월을 확인해 주세요.");
export const arrivalConfigSchema = z.object({
  enabled: z.boolean(), effectiveDate: arrivalDateSchema,
  numberLength: z.number().int().min(1).max(20), popupMs: z.number().int().min(500).max(5000),
  deviceDays: z.number().int().min(1).max(365),
}).strict();
export type ArrivalConfig = z.infer<typeof arrivalConfigSchema>;
export const DEFAULT_ARRIVAL_CONFIG: ArrivalConfig = { enabled: false, effectiveDate: "1970-01-01", numberLength: 5, popupMs: 1200, deviceDays: 30 };
export type ArrivalActor = { id: string; name: string; role: string };
export type ArrivalSettingsVersion = ArrivalConfig & { id: string; savedAt: string; savedById: string; savedByName: string };
export type ArrivalSettingsDocument = { revision: number; versions: ArrivalSettingsVersion[] };
export function normalizeArrivalSettings(value: unknown): ArrivalSettingsDocument {
  if (!value || typeof value !== "object" || !("versions" in value) || !Array.isArray(value.versions)) return { revision: 0, versions: [] };
  return value as ArrivalSettingsDocument;
}
export function effectiveArrivalConfig(document: ArrivalSettingsDocument, today = getKstTodayYmd()): ArrivalConfig {
  return [...document.versions].reverse().filter((v) => v.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? DEFAULT_ARRIVAL_CONFIG;
}
export type ArrivalSource = "KIOSK" | "ADMIN_ADDED" | "ADMIN_CORRECTED";
export const ARRIVAL_SOURCE_LABELS: Record<ArrivalSource, string> = { KIOSK: "공용 기기", ADMIN_ADDED: "관리자 추가", ADMIN_CORRECTED: "관리자 정정" };
export type ArrivalRecord = {
  id: string; divisionId: string; studentId: string; date: string;
  firstReceivedAt: string | null; effectiveAt: string; source: ArrivalSource;
  deviceId: string | null; deviceName: string | null; cancelledAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};
export type ArrivalHistory = {
  id: string; divisionId: string; arrivalId: string; studentId: string;
  action: "CHECK_IN" | "RECHECK" | "ADD" | "CORRECT" | "CANCEL";
  before: ArrivalRecord | null; after: ArrivalRecord;
  reason: string | null; actorId: string | null; actorName: string; createdAt: string;
};
export type ArrivalDevice = { id: string; divisionId: string; name: string; credentialHash: string; registeredById: string; registeredByName: string; createdAt: string; expiresAt: string; revokedAt: string | null };
export type ArrivalPairing = { id: string; divisionId: string; codeHash: string; tokenHash: string; createdAt: string; expiresAt: string; deviceId: string | null };
export type ArrivalDeviceSummary = Omit<ArrivalDevice, "credentialHash" | "registeredById">;
export type ArrivalStudent = { id: string; divisionId: string; name: string; studentNumber: string; status: string };
export type ArrivalRow = { studentId: string; name: string; studentNumber: string; isEligible: boolean; record: ArrivalRecord | null };
export type ArrivalDayResult = { date: string; today: string; rows: ArrivalRow[]; recordedCount: number; missingCount: number | null; refreshedAt: string };
export type ArrivalMonthResult = { month: string; today: string; student: { id: string; name: string; studentNumber: string }; records: ArrivalRecord[]; history?: ArrivalHistory[] };
export type ArrivalSettingsResult = { revision: number; current: ArrivalConfig; versions: ArrivalSettingsVersion[]; devices: ArrivalDeviceSummary[] };
export type ArrivalSettingsPreview = { revision: number; before: ArrivalConfig; after: ArrivalConfig; eligibleCount: number; matchingCount: number; mismatchedCount: number };
export const arrivalSettingsInputSchema = z.object({ expectedRevision: z.number().int().nonnegative(), config: arrivalConfigSchema }).strict();
export const arrivalCorrectionSchema = z.object({
  action: z.enum(["ADD", "CORRECT", "CANCEL"]), studentId: z.string().min(1).max(100), date: arrivalDateSchema,
  expectedVersion: z.number().int().nonnegative(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "시각을 확인해 주세요.").optional(),
  reason: z.string().trim().min(1, "정정 사유를 입력해 주세요.").max(500),
}).strict();
export type ArrivalCorrection = z.infer<typeof arrivalCorrectionSchema>;
export function formatArrivalTime(value: string, seconds = false) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hourCycle: "h23" }).format(new Date(value));
}
