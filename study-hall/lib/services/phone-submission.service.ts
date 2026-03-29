import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockPhoneSubmissionRecord,
} from "@/lib/mock-store";
import type { PhoneSubmissionBatchSchemaInput } from "@/lib/phone-submission-schemas";
import { getPrismaClient, getDivisionBySlugOrThrow } from "@/lib/service-helpers";
import { listStudents, type StudentListItem } from "@/lib/services/student.service";
import { getPeriods, type PeriodRecord } from "@/lib/services/period.service";

type PhoneActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type PhoneCheckStatus = "SUBMITTED" | "NOT_SUBMITTED" | "RENTED";

export type PhoneCheckRecord = {
  id: string;
  divisionId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  periodId: string;
  periodName: string;
  date: string;
  status: PhoneCheckStatus;
  rentalNote: string | null;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
};

export type PhonePeriodSnapshot = {
  periodId: string;
  periodName: string;
  periodLabel: string | null;
  displayOrder: number;
  startTime: string;
  endTime: string;
  records: PhoneCheckRecord[];
  submittedCount: number;
  notSubmittedCount: number;
  rentedCount: number;
  uncheckedCount: number;
  totalStudents: number;
};

export type PhoneDaySnapshot = {
  date: string;
  periods: PhonePeriodSnapshot[];
  students: StudentListItem[];
};

function serializeMockRecord(
  record: MockPhoneSubmissionRecord,
  student: StudentListItem,
  period: PeriodRecord,
): PhoneCheckRecord {
  return {
    id: record.id,
    divisionId: record.divisionId,
    studentId: record.studentId,
    studentName: student.name,
    studentNumber: student.studentNumber,
    periodId: record.periodId,
    periodName: period.name,
    date: record.date,
    status: record.status as PhoneCheckStatus,
    rentalNote: record.rentalNote,
    recordedById: record.recordedById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function serializeDbRecord(
  record: {
    id: string;
    divisionId: string;
    studentId: string;
    periodId: string;
    date: Date;
    status: string;
    rentalNote: string | null;
    recordedById: string;
    createdAt: Date;
    updatedAt: Date;
  },
  student: StudentListItem,
  period: PeriodRecord,
): PhoneCheckRecord {
  return {
    id: record.id,
    divisionId: record.divisionId,
    studentId: record.studentId,
    studentName: student.name,
    studentNumber: student.studentNumber,
    periodId: record.periodId,
    periodName: period.name,
    date: record.date.toISOString().slice(0, 10),
    status: record.status as PhoneCheckStatus,
    rentalNote: record.rentalNote,
    recordedById: record.recordedById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildPeriodSnapshot(
  period: PeriodRecord,
  records: PhoneCheckRecord[],
  totalStudents: number,
): PhonePeriodSnapshot {
  const periodRecords = records.filter((r) => r.periodId === String(period.id));
  const submittedCount = periodRecords.filter((r) => r.status === "SUBMITTED").length;
  const notSubmittedCount = periodRecords.filter((r) => r.status === "NOT_SUBMITTED").length;
  const rentedCount = periodRecords.filter((r) => r.status === "RENTED").length;
  const uncheckedCount = Math.max(totalStudents - periodRecords.length, 0);

  return {
    periodId: String(period.id),
    periodName: period.name,
    periodLabel: period.label ?? null,
    displayOrder: period.displayOrder,
    startTime: period.startTime,
    endTime: period.endTime,
    records: periodRecords,
    submittedCount,
    notSubmittedCount,
    rentedCount,
    uncheckedCount,
    totalStudents,
  };
}

export async function getPhoneDaySnapshot(
  divisionSlug: string,
  date: string,
): Promise<PhoneDaySnapshot> {
  const [allStudents, allPeriods] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
  ]);
  const students = allStudents.filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE");
  const activePeriods = allPeriods.filter((p) => p.isActive);

  if (isMockMode()) {
    const state = await readMockState();
    const dayRecords = (state.phoneSubmissionsByDivision[divisionSlug] ?? []).filter(
      (r) => r.date === date,
    );

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const periodMap = new Map(activePeriods.map((p) => [String(p.id), p]));

    const allRecords: PhoneCheckRecord[] = dayRecords
      .map((r) => {
        const student = studentMap.get(r.studentId);
        const period = periodMap.get(r.periodId);
        return student && period ? serializeMockRecord(r, student, period) : null;
      })
      .filter((item): item is PhoneCheckRecord => item !== null);

    const periods = activePeriods.map((period) =>
      buildPeriodSnapshot(period, allRecords, students.length),
    );

    return { date, periods, students };
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const [y, m, d] = date.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));

  const dbRecords = await prisma.phoneSubmission.findMany({
    where: { divisionId: division.id, date: targetDate },
    orderBy: { createdAt: "asc" },
  });

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const periodMap = new Map(activePeriods.map((p) => [p.id, p]));

  const allRecords: PhoneCheckRecord[] = dbRecords
    .map((r) => {
      const student = studentMap.get(r.studentId);
      const period = periodMap.get(r.periodId);
      return student && period ? serializeDbRecord(r, student, period) : null;
    })
    .filter((item): item is PhoneCheckRecord => item !== null);

  const periods = activePeriods.map((period) =>
    buildPeriodSnapshot(period, allRecords, students.length),
  );

  return { date, periods, students };
}

export async function upsertPhoneCheckBatch(
  divisionSlug: string,
  actor: PhoneActor,
  input: PhoneSubmissionBatchSchemaInput,
): Promise<PhoneDaySnapshot> {
  const { date, periodId, records } = input;

  if (isMockMode()) {
    const division = getMockDivisionBySlug(divisionSlug);
    if (!division) throw notFound("지점 정보를 찾을 수 없습니다.");

    await updateMockState((state) => {
      const existing = state.phoneSubmissionsByDivision[divisionSlug] ?? [];
      const now = new Date().toISOString();

      for (const r of records) {
        const idx = existing.findIndex(
          (e) => e.studentId === r.studentId && e.date === date && e.periodId === periodId,
        );

        if (idx === -1) {
          existing.push({
            id: `mock-phone-${divisionSlug}-${r.studentId}-${date}-${periodId}-${Date.now()}`,
            divisionId: division.id,
            studentId: r.studentId,
            periodId,
            date,
            status: r.status,
            rentalNote: r.rentalNote?.trim() || null,
            recordedById: actor.id,
            createdAt: now,
            updatedAt: now,
          } satisfies MockPhoneSubmissionRecord);
        } else {
          existing[idx] = {
            ...existing[idx],
            status: r.status,
            rentalNote: r.rentalNote?.trim() || null,
            recordedById: actor.id,
            updatedAt: now,
          };
        }
      }

      state.phoneSubmissionsByDivision[divisionSlug] = existing;
      return null;
    });

    return getPhoneDaySnapshot(divisionSlug, date);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const [y, m, d] = date.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));

  await prisma.$transaction(
    records.map((r) =>
      prisma.phoneSubmission.upsert({
        where: {
          studentId_date_periodId: {
            studentId: r.studentId,
            date: targetDate,
            periodId,
          },
        },
        create: {
          divisionId: division.id,
          studentId: r.studentId,
          periodId,
          date: targetDate,
          status: r.status,
          rentalNote: r.rentalNote?.trim() || null,
          recordedById: actor.id,
        },
        update: {
          status: r.status,
          rentalNote: r.rentalNote?.trim() || null,
          recordedById: actor.id,
        },
      }),
    ),
  );

  return getPhoneDaySnapshot(divisionSlug, date);
}

export async function listPhoneRecords(
  divisionSlug: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    studentId?: string;
    status?: PhoneCheckStatus;
  },
): Promise<PhoneCheckRecord[]> {
  const [students, allPeriods] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
  ]);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const periodMap = new Map(allPeriods.map((p) => [String(p.id), p]));

  if (isMockMode()) {
    const state = await readMockState();
    let records = state.phoneSubmissionsByDivision[divisionSlug] ?? [];
    if (options?.dateFrom) records = records.filter((r) => r.date >= options.dateFrom!);
    if (options?.dateTo) records = records.filter((r) => r.date <= options.dateTo!);
    if (options?.studentId) records = records.filter((r) => r.studentId === options.studentId);
    if (options?.status) records = records.filter((r) => r.status === options.status);

    return records
      .map((r) => {
        const student = studentMap.get(r.studentId);
        const period = periodMap.get(r.periodId);
        return student && period ? serializeMockRecord(r, student, period) : null;
      })
      .filter((item): item is PhoneCheckRecord => item !== null)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const where: Record<string, unknown> = { divisionId: division.id };
  if (options?.dateFrom) {
    const [y, m, d] = options.dateFrom.split("-").map(Number);
    where.date = { ...(where.date as object ?? {}), gte: new Date(Date.UTC(y, m - 1, d)) };
  }
  if (options?.dateTo) {
    const [y, m, d] = options.dateTo.split("-").map(Number);
    where.date = { ...(where.date as object ?? {}), lte: new Date(Date.UTC(y, m - 1, d)) };
  }
  if (options?.studentId) where.studentId = options.studentId;
  if (options?.status) where.status = options.status;

  const dbRecords = await prisma.phoneSubmission.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "asc" }],
  });

  return dbRecords
    .map((r) => {
      const student = studentMap.get(r.studentId);
      const period = periodMap.get(r.periodId);
      return student && period ? serializeDbRecord(r, student, period) : null;
    })
    .filter((item): item is PhoneCheckRecord => item !== null);
}
