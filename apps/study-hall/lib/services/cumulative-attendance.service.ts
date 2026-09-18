import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { configurationForDate } from "@/lib/academy-configuration-history";
import { examAttendancePeriod } from "@/lib/exam-attendance";
import { kstDate } from "@/lib/management-policy";
import { normalizeYmdDate } from "@/lib/date-utils";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { parseCumulativeAttendance } from "@/lib/cumulative-attendance-parser";
import { CUMULATIVE_ATTENDANCE_SOURCE, participationRows, selectedParticipation,
  type ParticipationPreview, type ParticipationSelection, type ParticipationStudent,
  type ParticipationAttendance } from "@/lib/cumulative-attendance";
import { syncAttendanceDerivedPoints } from "@/lib/services/attendance.service";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

type Configuration = { settings: { managementPolicy?: unknown; examPointAutomation?: unknown }; periods: { id: string; name: string; isActive: boolean }[] };
type Context = { students: ParticipationStudent[]; attendance: ParticipationAttendance[]; configuration: Configuration };
type Files = { score: Buffer; analysis?: Buffer };
type Input = { date?: string; token?: string; selection?: ParticipationSelection[] };
type State = Awaited<ReturnType<typeof readMockState>>;
const ymd = (date: Date) => date.toISOString().slice(0, 10);

function mockContext(state: State, slug: string, date: string): Context {
  const division = state.divisions.find(d => d.slug === slug);
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  const current: Configuration = { settings: state.divisionSettingsByDivision[slug], periods: state.periodsByDivision[slug] ?? [] };
  return { students: state.studentsByDivision[slug] ?? [], attendance: state.attendanceByDivision[slug] ?? [],
    configuration: configurationForDate(current, (state.academyApplications ?? []).filter(a => a.divisionId === division.id), date) };
}

async function dbContext(tx: Prisma.TransactionClient, slug: string, day: string): Promise<Context> {
  const division = await tx.division.findUnique({ where: { slug }, select: { id: true } });
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  const divisionId = division.id;
  const [settings, periods, students, attendance, history] = await Promise.all([
    tx.divisionSettings.findUnique({ where: { divisionId }, select: { managementPolicy: true, examPointAutomation: true } }),
    tx.period.findMany({ where: { divisionId }, select: { id: true, name: true, isActive: true } }),
    tx.student.findMany({ where: { divisionId }, select: { id: true, name: true, studentNumber: true, status: true, seatId: true, enrolledAt: true, courseStartDate: true, courseEndDate: true } }),
    tx.attendance.findMany({ where: { student: { divisionId }, period: { divisionId }, date: new Date(`${day}T00:00:00Z`) } }),
    tx.academyConfigurationApplication.findMany({ where: { divisionId, status: "APPLIED" }, select: { status: true, effectiveFrom: true, createdAt: true, before: true, after: true } }),
  ]);
  const configuration = configurationForDate<Configuration>({ settings: settings ?? {}, periods }, history.map(h => ({ ...h,
    effectiveFrom: ymd(h.effectiveFrom), createdAt: h.createdAt.toISOString(), before: h.before as unknown as Configuration, after: h.after as unknown as Configuration })), day);
  // The historical period must still belong to this division and be writable.
  configuration.periods = configuration.periods.filter(p => periods.some(current => current.id === p.id && current.isActive));
  return { configuration, students: students.map(s => ({ ...s, enrolledAt: s.enrolledAt.toISOString(),
    courseStartDate: s.courseStartDate ? ymd(s.courseStartDate) : null, courseEndDate: s.courseEndDate ? ymd(s.courseEndDate) : null })),
    attendance: attendance.map(a => ({ ...a, date: ymd(a.date), updatedAt: a.updatedAt.toISOString() })) };
}

export async function importCumulativeAttendance(slug: string, actorId: string, files: Files, input: Input, confirm = false) {
  const file = parseCumulativeAttendance(files.score, files.analysis);
  const date = normalizeYmdDate(file.examDate ?? input.date ?? "", "시험일");
  if (file.examDate && input.date && input.date !== file.examDate) throw badRequest(`파일의 시험일은 ${file.examDate}입니다. 선택한 시험일을 확인해주세요.`);
  if (date > kstDate()) throw badRequest("아직 치르지 않은 시험은 출석에 반영할 수 없습니다.");
  const digest = createHash("sha256").update(files.score).update(files.analysis ?? Buffer.alloc(0)).digest("hex");
  function preview(context: Context): ParticipationPreview {
    const periodId = examAttendancePeriod(context.configuration.settings, date);
    const period = context.configuration.periods.find(p => p.id === periodId && p.isActive);
    if (!periodId || !period) throw badRequest("이 시험일에 적용된 아침모의고사 출석 교시가 없습니다. 운영 규칙의 아침시험 시작일·요일·휴강일과 출석 연동 교시를 확인해주세요.");
    const result = participationRows(file, context.students, context.attendance, date, periodId);
    result.rows.sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
    const existing = context.attendance.filter(a => a.date === date && a.periodId === periodId).sort((a, b) => a.studentId.localeCompare(b.studentId));
    const value = { date, periodId, periodName: period.name, fileCount: file.students.length, ...result };
    const token = createHash("sha256").update(JSON.stringify({ slug, digest, value, existing, settings: context.configuration.settings })).digest("hex");
    return { ...value, token };
  }
  function confirmed(result: ParticipationPreview) {
    if (input.token !== result.token) throw conflict("파일·학생 명단·출결 또는 설정이 변경되었습니다. 다시 미리보기를 실행해주세요.");
    if (result.unmatchedCount === result.fileCount) throw badRequest("학원 학생과 일치하는 수험번호가 없습니다. 학생 명단과 파일을 확인해주세요.");
    return selectedParticipation(result.rows, input.selection ?? []).filter(row => row.changed);
  }
  if (!confirm) {
    if (isMockMode()) return { preview: preview(mockContext(await readMockState(), slug, date)) };
    const prisma = await getPrismaClient();
    return { preview: await prisma.$transaction(async tx => preview(await dbContext(tx, slug, date)), { isolationLevel: "Serializable" }) };
  }
  let saved: { applied: number; periodId: string };
  if (isMockMode()) {
    saved = await updateMockState(state => {
      const result = preview(mockContext(state, slug, date)), changes = confirmed(result);
      const attendance = state.attendanceByDivision[slug] ??= [];
      const now = new Date().toISOString();
      for (const row of changes) {
        const existing = attendance.find(a => a.studentId === row.studentId && a.periodId === result.periodId && a.date === date);
        const value = { status: row.status, reason: row.status === "ABSENT" ? "누적시험 미응시 확인" : null,
          examAutoSource: CUMULATIVE_ATTENDANCE_SOURCE, recordedById: actorId, checkInTime: null, updatedAt: now };
        if (existing) Object.assign(existing, value);
        else attendance.push({ ...value, id: randomUUID(), studentId: row.studentId, periodId: result.periodId, date, createdAt: now });
      }
      return { applied: changes.length, periodId: result.periodId };
    });
  } else {
    const prisma = await getPrismaClient();
    saved = await prisma.$transaction(async tx => {
      const result = preview(await dbContext(tx, slug, date)), changes = confirmed(result);
      for (const row of changes) {
        const data = { status: row.status, reason: row.status === "ABSENT" ? "누적시험 미응시 확인" : null,
          examAutoSource: CUMULATIVE_ATTENDANCE_SOURCE, recordedById: actorId, checkInTime: null };
        await tx.attendance.upsert({ where: { studentId_periodId_date: { studentId: row.studentId, periodId: result.periodId, date: new Date(`${date}T00:00:00Z`) },
          student: { division: { slug } }, period: { division: { slug } } },
          create: { ...data, studentId: row.studentId, periodId: result.periodId, date: new Date(`${date}T00:00:00Z`) }, update: data });
      }
      return { applied: changes.length, periodId: result.periodId };
    }, { isolationLevel: "Serializable", timeout: 30000 });
  }
  // Importing selected attendance must not also backfill unrelated grading attendance.
  const warnings = await syncAttendanceDerivedPoints(slug, date, actorId, false);
  revalidateDivisionOperationalViews(slug);
  return { result: { date, ...saved, warnings } };
}
