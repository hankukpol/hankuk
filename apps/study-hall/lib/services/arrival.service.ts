import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { arrivalDateSchema, arrivalMonthSchema, arrivalSettingsInputSchema, effectiveArrivalConfig, type ArrivalActor, type ArrivalConfig, type ArrivalCorrection, type ArrivalDayResult, type ArrivalMonthResult, type ArrivalSettingsResult, type ArrivalSettingsPreview, type ArrivalDevice } from "@/lib/arrivals";
import { applyArrivalCheckIn, applyArrivalCorrection, assertArrivalAdmin, isArrivalEligible } from "@/lib/arrival-domain";
import { getKstTodayYmd } from "@/lib/date-utils";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { withArrivalData, type ArrivalData } from "@/lib/services/arrival-store";

const PAIRING_MS = 10 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function configFor(data: ArrivalData, now: Date) { return effectiveArrivalConfig(data.settings, getKstTodayYmd(now)); }
function assertOperational(data: ArrivalData) {
  if (!data.divisionActive || !data.attendanceEnabled) throw forbidden("이 학원에서는 출결 관리를 사용하지 않습니다.");
}
function deviceFrom(data: ArrivalData, credential: string | undefined, now: Date) {
  if (!credential || !/^[A-Za-z0-9_-]{43}$/.test(credential)) return null;
  const device = data.devices.find((d) => d.divisionId === data.divisionId && d.credentialHash === hash(credential));
  return device && !device.revokedAt && new Date(device.expiresAt) > now ? device : null;
}
function deviceSummary(device: ArrivalDevice) {
  return { id: device.id, divisionId: device.divisionId, name: device.name, registeredByName: device.registeredByName, createdAt: device.createdAt, expiresAt: device.expiresAt, revokedAt: device.revokedAt };
}
function settingsResult(data: ArrivalData, now: Date): ArrivalSettingsResult {
  return { revision: data.settings.revision, current: configFor(data, now), versions: [...data.settings.versions].reverse(), devices: [...data.devices].filter(device => !data.settings.deletedDeviceIds?.includes(device.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(deviceSummary) };
}
function appendEvent(data: ArrivalData, actor: ArrivalActor, now: Date, changes: { field: string; label: string; before: unknown; after: unknown }[]) {
  data.settingsEvents.push({ id: randomUUID(), divisionId: data.divisionId, section: "ARRIVALS", changes, changedById: actor.id, changedByName: actor.name, changedAt: now.toISOString() });
}

export async function startArrivalPairing(slug: string, previousToken?: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const code = randomBytes(6).toString("hex").toUpperCase();
  return withArrivalData(slug, { write: true, pairings: true }, (data) => {
    assertOperational(data);
    // Issuing another code in this browser retires its old unapproved code.
    const old = data.pairings.find((p) => previousToken && p.tokenHash === hash(previousToken));
    if (old && !old.deviceId) old.expiresAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + PAIRING_MS).toISOString();
    data.pairings.push({ id: randomUUID(), divisionId: data.divisionId, codeHash: hash(code), tokenHash: hash(token), createdAt: now.toISOString(), expiresAt, deviceId: null });
    return { token, code, expiresAt };
  });
}

export async function arrivalKioskStatus(slug: string, credential?: string, pairingToken?: string, now = new Date()) {
  return withArrivalData(slug, { devices: true, pairings: true }, (data) => {
    const config = configFor(data, now);
    if (!data.divisionActive || !data.attendanceEnabled) return { status: "disabled" as const };
    const device = deviceFrom(data, credential, now);
    if (device) return config.enabled ? { status: "ready" as const, numberLength: config.numberLength, popupMs: config.popupMs } : { status: "disabled" as const };
    const pairing = pairingToken && data.pairings.find((p) => p.tokenHash === hash(pairingToken) && p.divisionId === data.divisionId);
    if (pairing && new Date(pairing.expiresAt) > now) {
      const registered = pairing.deviceId && deviceFrom(data, pairingToken, now);
      if (registered) return { status: config.enabled ? "ready" as const : "disabled" as const, numberLength: config.numberLength, popupMs: config.popupMs, credential: pairingToken, expiresAt: registered.expiresAt };
      return { status: "pending" as const, expiresAt: pairing.expiresAt };
    }
    return { status: credential || pairingToken ? "expired" as const : "unpaired" as const };
  });
}

export async function recordArrival(slug: string, credential: string | undefined, studentNumber: string, now = new Date()) {
  // Authenticate before acquiring the receipt lock or querying students/records.
  // Recheck inside the write transaction to serialize concurrent revocation.
  await withArrivalData(slug, { devices: true }, (data) => {
    assertOperational(data);
    if (!deviceFrom(data, credential, now)) throw forbidden("공용 기기 등록이 만료되거나 해제되었습니다. 관리자에게 문의해 주세요.");
  });
  return withArrivalData(slug, { write: true, students: { studentNumber }, records: { date: getKstTodayYmd(now) }, devices: true }, (data) => {
    assertOperational(data);
    const config = configFor(data, now);
    if (!config.enabled) throw forbidden("등원 체크를 사용하지 않습니다. 관리자에게 문의해 주세요.");
    const device = deviceFrom(data, credential, now);
    if (!device) throw forbidden("공용 기기 등록이 만료되거나 해제되었습니다. 관리자에게 문의해 주세요.");
    if (!new RegExp(`^[0-9]{${config.numberLength}}$`).test(studentNumber)) throw badRequest("수험번호를 확인해 주세요.");
    const student = data.students.find((s) => s.studentNumber === studentNumber && s.divisionId === data.divisionId);
    if (!student) throw badRequest("수험번호를 확인해 주세요.");
    const previous = data.records.find((r) => r.studentId === student.id) ?? null;
    const result = applyArrivalCheckIn(previous, student, device, now);
    if (result.history) { data.records = [...data.records.filter((r) => r.id !== result.record.id), result.record]; data.history.push(result.history); }
    return { ok: true as const, popupMs: config.popupMs };
  });
}

export async function listArrivalDay(slug: string, rawDate: string, now = new Date()): Promise<ArrivalDayResult> {
  const date = arrivalDateSchema.parse(rawDate);
  return withArrivalData(slug, { students: "all", records: { date } }, (data) => {
    assertOperational(data);
    const today = getKstTodayYmd(now);
    const records = new Map(data.records.map((r) => [r.studentId, r]));
    const students = data.students.filter((s) => records.has(s.id) || (date === today && isArrivalEligible(s)));
    const rows = students.map((s) => ({ studentId: s.id, name: s.name, studentNumber: s.studentNumber, isEligible: isArrivalEligible(s), record: records.get(s.id) ?? null }));
    rows.sort((a, b) => (b.record?.effectiveAt ?? "").localeCompare(a.record?.effectiveAt ?? "") || a.studentNumber.localeCompare(b.studentNumber));
    return { date, today, rows, recordedCount: rows.filter((r) => r.record && !r.record.cancelledAt).length, missingCount: date === today ? rows.filter((r) => r.isEligible && (!r.record || r.record.cancelledAt)).length : null, refreshedAt: now.toISOString() };
  });
}

export async function listArrivalMonth(slug: string, studentId: string, rawMonth: string, includeHistory: boolean, now = new Date()): Promise<ArrivalMonthResult> {
  const month = arrivalMonthSchema.parse(rawMonth);
  return withArrivalData(slug, { students: { id: studentId }, records: { studentId, month }, history: includeHistory }, (data) => {
    assertOperational(data);
    const student = data.students.find((s) => s.id === studentId);
    if (!student) throw notFound("학생 정보를 찾을 수 없습니다.");
    return { month, today: getKstTodayYmd(now), student: { id: student.id, name: student.name, studentNumber: student.studentNumber }, records: data.records.sort((a, b) => a.date.localeCompare(b.date)), ...(includeHistory ? { history: data.history.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } : {}) };
  });
}

export async function findArrivalStudents(slug: string, query: string) {
  return withArrivalData(slug, { students: "all" }, (data) => {
    assertOperational(data);
    const q = query.trim().toLowerCase();
    return { students: data.students.filter((s) => !q || s.name.toLowerCase().includes(q) || s.studentNumber.includes(q)).sort((a, b) => a.name.localeCompare(b.name, "ko")) };
  });
}

export async function correctArrival(slug: string, input: ArrivalCorrection, actor: ArrivalActor, now = new Date()) {
  assertArrivalAdmin(actor);
  arrivalDateSchema.parse(input.date);
  return withArrivalData(slug, { write: true, students: { id: input.studentId }, records: { studentId: input.studentId, date: input.date } }, (data) => {
    assertOperational(data);
    const student = data.students.find((s) => s.id === input.studentId);
    if (!student) throw notFound("학생 정보를 찾을 수 없습니다.");
    const result = applyArrivalCorrection(data.records[0] ?? null, student, input, actor, now);
    data.records = [result.record]; data.history.push(result.history);
    return { ok: true as const };
  });
}

export async function getArrivalSettings(slug: string) {
  return withArrivalData(slug, { devices: true }, (data) => settingsResult(data, new Date()));
}

function validateSettingChange(data: ArrivalData, raw: unknown) {
  const input = arrivalSettingsInputSchema.parse(raw);
  if (input.expectedRevision !== data.settings.revision) throw conflict("다른 관리자가 설정을 변경했습니다. 최신 설정을 다시 확인해 주세요.");
  return input;
}
export async function previewArrivalSettings(slug: string, raw: unknown, now = new Date()): Promise<ArrivalSettingsPreview> {
  void now; // Past effective dates are valid; callers may still supply their clock.
  return withArrivalData(slug, { students: "all" }, (data) => {
    const input = validateSettingChange(data, raw);
    const eligible = data.students.filter(isArrivalEligible);
    const matchingCount = eligible.filter((s) => new RegExp(`^[0-9]{${input.config.numberLength}}$`).test(s.studentNumber)).length;
    return { revision: data.settings.revision, before: effectiveArrivalConfig(data.settings, input.config.effectiveDate), after: input.config, eligibleCount: eligible.length, matchingCount, mismatchedCount: eligible.length - matchingCount };
  });
}
export async function saveArrivalSettings(slug: string, raw: unknown, actor: ArrivalActor, now = new Date()) {
  assertArrivalAdmin(actor);
  return withArrivalData(slug, { write: true, devices: true }, (data) => {
    const { config } = validateSettingChange(data, raw);
    const before = effectiveArrivalConfig(data.settings, config.effectiveDate);
    const labels: Record<keyof ArrivalConfig, string> = { enabled: "등원 체크 사용", effectiveDate: "등원 적용일", numberLength: "수험번호 자리수", popupMs: "완료 팝업 시간(ms)", deviceDays: "기기 인증 유효 일수" };
    const changes = (Object.keys(labels) as (keyof ArrivalConfig)[]).filter((key) => before[key] !== config[key]).map((key) => ({ field: key, label: labels[key], before: before[key], after: config[key] }));
    data.settings = { ...data.settings, revision: data.settings.revision + 1, versions: [...data.settings.versions, { ...config, id: randomUUID(), savedAt: now.toISOString(), savedById: actor.id, savedByName: actor.name }] };
    appendEvent(data, actor, now, changes.length ? changes : [{ field: "revision", label: "등원 설정 재확인", before: data.settings.revision - 1, after: data.settings.revision }]);
    return settingsResult(data, now);
  });
}

export async function approveArrivalDevice(slug: string, raw: unknown, actor: ArrivalActor, now = new Date()) {
  assertArrivalAdmin(actor);
  const input = z.object({ code: z.string().trim().transform((v) => v.replaceAll("-", "").toUpperCase()).pipe(z.string().regex(/^[A-F0-9]{12}$/)), name: z.string().trim().min(1, "기기 이름을 입력해 주세요.").max(80) }).strict().parse(raw);
  return withArrivalData(slug, { write: true, devices: true, pairings: true }, (data) => {
    assertOperational(data);
    const pairing = data.pairings.find((p) => p.divisionId === data.divisionId && p.codeHash === hash(input.code) && new Date(p.expiresAt) > now && !p.deviceId);
    if (!pairing) throw badRequest("등록 코드를 확인해 주세요. 코드는 10분간 한 번 사용할 수 있습니다.");
    const config = configFor(data, now);
    const device: ArrivalDevice = { id: randomUUID(), divisionId: data.divisionId, name: input.name, credentialHash: pairing.tokenHash, registeredById: actor.id, registeredByName: actor.name, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + config.deviceDays * 86400000).toISOString(), revokedAt: null };
    pairing.deviceId = device.id; data.devices.push(device);
    appendEvent(data, actor, now, [{ field: "arrivalDevice", label: "등원 기기 등록", before: null, after: { id: device.id, name: device.name, expiresAt: device.expiresAt } }]);
    return settingsResult(data, now);
  });
}
export async function revokeArrivalDevice(slug: string, deviceId: string, actor: ArrivalActor, now = new Date()) {
  assertArrivalAdmin(actor);
  return withArrivalData(slug, { write: true, devices: true }, (data) => {
    const device = data.devices.find((d) => d.id === deviceId && d.divisionId === data.divisionId);
    if (!device) throw notFound("기기 정보를 찾을 수 없습니다.");
    if (!device.revokedAt) {
      device.revokedAt = now.toISOString();
      appendEvent(data, actor, now, [{ field: "arrivalDevice", label: "등원 기기 해제", before: { id: device.id, name: device.name }, after: { revokedAt: device.revokedAt } }]);
    }
    return settingsResult(data, now);
  });
}

/** Hide revoked devices without deleting the provenance of recorded arrivals. */
export async function deleteRevokedArrivalDevice(slug: string, deviceId: string, actor: ArrivalActor, now = new Date()) {
  assertArrivalAdmin(actor);
  return withArrivalData(slug, { write: true, devices: true }, data => {
    const device = data.devices.find(d => d.id === deviceId && d.divisionId === data.divisionId);
    if (!device) throw notFound("기기를 찾을 수 없습니다.");
    if (!device.revokedAt) throw badRequest("먼저 기기 승인을 해제해 주세요.");
    const deleted = data.settings.deletedDeviceIds ?? [];
    if (!deleted.includes(device.id)) {
      data.settings.deletedDeviceIds = [...deleted, device.id];
      appendEvent(data, actor, now, [{ field: "arrivalDevice", label: "승인 해제 기기 목록 삭제", before: { id: device.id, name: device.name }, after: { deletedAt: now.toISOString() } }]);
    }
    return settingsResult(data, now);
  });
}
