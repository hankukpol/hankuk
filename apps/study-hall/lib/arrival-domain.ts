import { randomUUID } from "node:crypto";
import { arrivalCorrectionSchema, type ArrivalActor, type ArrivalCorrection, type ArrivalDevice, type ArrivalHistory, type ArrivalRecord, type ArrivalStudent } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { badRequest, conflict, forbidden } from "@/lib/errors";

export function assertArrivalAdmin(actor: ArrivalActor) {
  if (!["ADMIN", "SUPER_ADMIN"].includes(actor.role)) throw forbidden("관리자 권한이 필요합니다.");
}
export function isArrivalEligible(student: ArrivalStudent) {
  return student.status === "ACTIVE" || student.status === "ON_LEAVE";
}
function assertIdentity(record: ArrivalRecord | null, student: ArrivalStudent, date: string) {
  if (record && (record.divisionId !== student.divisionId || record.studentId !== student.id || record.date !== date)) throw forbidden("해당 등원 기록에 접근할 수 없습니다.");
}
function history(before: ArrivalRecord | null, after: ArrivalRecord, action: ArrivalHistory["action"], now: Date, actor?: ArrivalActor, reason?: string): ArrivalHistory {
  return { id: randomUUID(), divisionId: after.divisionId, arrivalId: after.id, studentId: after.studentId, action, before: before ? { ...before } : null, after: { ...after }, reason: reason ?? null, actorId: actor?.id ?? null, actorName: actor?.name ?? after.deviceName ?? "공용 기기", createdAt: now.toISOString() };
}
export function applyArrivalCheckIn(previous: ArrivalRecord | null, student: ArrivalStudent, device: ArrivalDevice, now: Date) {
  if (!isArrivalEligible(student)) throw badRequest("수험번호를 확인해 주세요.");
  if (device.divisionId !== student.divisionId || device.revokedAt || new Date(device.expiresAt) <= now) throw forbidden("공용 기기 등록을 확인해 주세요.");
  const date = getKstTodayYmd(now);
  assertIdentity(previous, student, date);
  if (previous && !previous.cancelledAt) return { record: previous, history: null };
  const timestamp = now.toISOString();
  const record: ArrivalRecord = { id: previous?.id ?? randomUUID(), divisionId: student.divisionId, studentId: student.id, date, firstReceivedAt: previous?.firstReceivedAt ?? timestamp, effectiveAt: timestamp, source: "KIOSK", deviceId: device.id, deviceName: device.name, cancelledAt: null, version: (previous?.version ?? 0) + 1, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
  return { record, history: history(previous, record, previous ? "RECHECK" : "CHECK_IN", now) };
}
export function applyArrivalCorrection(previous: ArrivalRecord | null, student: ArrivalStudent, raw: ArrivalCorrection, actor: ArrivalActor, now: Date) {
  assertArrivalAdmin(actor);
  const input = arrivalCorrectionSchema.parse(raw);
  if (input.studentId !== student.id) throw forbidden("학생 정보를 확인해 주세요.");
  assertIdentity(previous, student, input.date);
  if ((previous?.version ?? 0) !== input.expectedVersion) throw conflict("다른 관리자가 기록을 변경했습니다. 최신 기록을 확인해 주세요.");
  if (input.action === "ADD" && previous && !previous.cancelledAt) throw conflict("이미 등원 기록이 있습니다. 시각 정정을 이용해 주세요.");
  if (input.action !== "ADD" && (!previous || previous.cancelledAt)) throw conflict("정정할 유효 기록이 없습니다. 최신 기록을 확인해 주세요.");
  if (input.date > getKstTodayYmd(now)) throw badRequest("미래 날짜에는 등원을 기록할 수 없습니다.");
  const timestamp = now.toISOString();
  let effectiveAt = previous?.effectiveAt ?? "";
  if (input.action !== "CANCEL") {
    if (!input.time) throw badRequest("등원 시각을 입력해 주세요.");
    const instant = new Date(`${input.date}T${input.time.length === 5 ? `${input.time}:00` : input.time}+09:00`);
    if (!Number.isFinite(instant.getTime()) || instant > now) throw badRequest("미래 시각에는 등원을 기록할 수 없습니다.");
    effectiveAt = instant.toISOString();
  }
  const record: ArrivalRecord = { id: previous?.id ?? randomUUID(), divisionId: student.divisionId, studentId: student.id, date: input.date, firstReceivedAt: previous?.firstReceivedAt ?? null, effectiveAt, source: input.action === "CANCEL" ? previous!.source : input.action === "ADD" ? "ADMIN_ADDED" : "ADMIN_CORRECTED", deviceId: previous?.deviceId ?? null, deviceName: previous?.deviceName ?? null, cancelledAt: input.action === "CANCEL" ? timestamp : null, version: (previous?.version ?? 0) + 1, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
  return { record, history: history(previous, record, input.action, now, actor, input.reason) };
}
