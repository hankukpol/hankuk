import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { notFound } from "@/lib/errors";
import { readMockState, updateMockState, type MockExamScheduleRecord } from "@/lib/mock-store";
import type { ExamScheduleSchemaInput, ExamScheduleUpdateSchemaInput } from "@/lib/exam-schedule-schemas";
import { calcDDay, formatDDay, type ExamScheduleTypeValue } from "@/lib/exam-schedule-meta";
import { getPrismaClient, getDivisionBySlugOrThrow } from "@/lib/service-helpers";

type ExamScheduleActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type ExamScheduleItem = {
  id: string;
  divisionId: string;
  name: string;
  type: ExamScheduleTypeValue;
  examDate: string;
  description: string | null;
  isActive: boolean;
  dDayValue: number;
  dDayLabel: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

function serializeRecord(record: MockExamScheduleRecord): ExamScheduleItem {
  const dDayValue = calcDDay(record.examDate);
  return {
    id: record.id,
    divisionId: record.divisionId,
    name: record.name,
    type: record.type as ExamScheduleTypeValue,
    examDate: record.examDate,
    description: record.description,
    isActive: record.isActive,
    dDayValue,
    dDayLabel: formatDDay(dDayValue),
    createdById: record.createdById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function serializeDbRecord(record: {
  id: string;
  divisionId: string;
  name: string;
  type: string;
  examDate: Date;
  description: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): ExamScheduleItem {
  const examDateStr = record.examDate.toISOString().slice(0, 10);
  const dDayValue = calcDDay(examDateStr);
  return {
    id: record.id,
    divisionId: record.divisionId,
    name: record.name,
    type: record.type as ExamScheduleTypeValue,
    examDate: examDateStr,
    description: record.description,
    isActive: record.isActive,
    dDayValue,
    dDayLabel: formatDDay(dDayValue),
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listExamSchedules(
  divisionSlug: string,
  options?: { onlyActive?: boolean; onlyUpcoming?: boolean },
): Promise<ExamScheduleItem[]> {
  const onlyActive = options?.onlyActive ?? false;
  const onlyUpcoming = options?.onlyUpcoming ?? false;

  if (isMockMode()) {
    const state = await readMockState();
    const records = state.examSchedulesByDivision[divisionSlug] ?? [];
    return records
      .filter((r) => (!onlyActive || r.isActive))
      .filter((r) => (!onlyUpcoming || calcDDay(r.examDate) >= 0))
      .map(serializeRecord)
      .sort((a, b) => a.examDate.localeCompare(b.examDate));
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const where: Record<string, unknown> = { divisionId: division.id };
  if (onlyActive) where.isActive = true;
  if (onlyUpcoming) where.examDate = { gte: new Date(new Date().toISOString().slice(0, 10)) };

  const records = await prisma.examSchedule.findMany({
    where,
    orderBy: { examDate: "asc" },
  });

  return records.map(serializeDbRecord);
}

export async function getNextExamSchedule(divisionSlug: string): Promise<ExamScheduleItem | null> {
  const upcoming = await listExamSchedules(divisionSlug, { onlyActive: true, onlyUpcoming: true });
  return upcoming[0] ?? null;
}

export async function createExamSchedule(
  divisionSlug: string,
  actor: ExamScheduleActor,
  input: ExamScheduleSchemaInput,
): Promise<ExamScheduleItem> {
  if (isMockMode()) {
    const division = getMockDivisionBySlug(divisionSlug);

    if (!division) {
      throw notFound("지점 정보를 찾을 수 없습니다.");
    }

    const record = await updateMockState((state) => {
      const now = new Date().toISOString();
      const newRecord: MockExamScheduleRecord = {
        id: `mock-exam-schedule-${divisionSlug}-${Date.now()}`,
        divisionId: division.id,
        name: input.name.trim(),
        type: input.type,
        examDate: input.examDate,
        description: input.description?.trim() || null,
        isActive: input.isActive ?? true,
        createdById: actor.id,
        createdAt: now,
        updatedAt: now,
      };
      state.examSchedulesByDivision[divisionSlug] = [
        ...(state.examSchedulesByDivision[divisionSlug] ?? []),
        newRecord,
      ];
      return newRecord;
    });

    return serializeRecord(record);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const [y, m, d] = input.examDate.split("-").map(Number);

  const created = await prisma.examSchedule.create({
    data: {
      divisionId: division.id,
      name: input.name.trim(),
      type: input.type,
      examDate: new Date(Date.UTC(y, m - 1, d)),
      description: input.description?.trim() || null,
      isActive: input.isActive ?? true,
      createdById: actor.id,
    },
  });

  return serializeDbRecord(created);
}

export async function updateExamSchedule(
  divisionSlug: string,
  scheduleId: string,
  input: ExamScheduleUpdateSchemaInput,
): Promise<ExamScheduleItem> {
  if (isMockMode()) {
    const record = await updateMockState((state) => {
      const list = state.examSchedulesByDivision[divisionSlug] ?? [];
      const idx = list.findIndex((r) => r.id === scheduleId);
      if (idx === -1) throw notFound("시험 일정을 찾을 수 없습니다.");
      const updated: MockExamScheduleRecord = {
        ...list[idx],
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.examDate !== undefined ? { examDate: input.examDate } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date().toISOString(),
      };
      state.examSchedulesByDivision[divisionSlug] = [
        ...list.slice(0, idx),
        updated,
        ...list.slice(idx + 1),
      ];
      return updated;
    });
    return serializeRecord(record);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const existing = await prisma.examSchedule.findFirst({
    where: { id: scheduleId, divisionId: division.id },
  });
  if (!existing) throw notFound("시험 일정을 찾을 수 없습니다.");

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.type !== undefined) data.type = input.type;
  if (input.examDate !== undefined) {
    const [y, m, d] = input.examDate.split("-").map(Number);
    data.examDate = new Date(Date.UTC(y, m - 1, d));
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.examSchedule.update({ where: { id: scheduleId }, data });
  return serializeDbRecord(updated);
}

export async function deleteExamSchedule(
  divisionSlug: string,
  scheduleId: string,
): Promise<void> {
  if (isMockMode()) {
    await updateMockState((state) => {
      const list = state.examSchedulesByDivision[divisionSlug] ?? [];
      const idx = list.findIndex((r) => r.id === scheduleId);
      if (idx === -1) throw notFound("시험 일정을 찾을 수 없습니다.");
      state.examSchedulesByDivision[divisionSlug] = [
        ...list.slice(0, idx),
        ...list.slice(idx + 1),
      ];
      return null;
    });
    return;
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const existing = await prisma.examSchedule.findFirst({
    where: { id: scheduleId, divisionId: division.id },
  });
  if (!existing) throw notFound("시험 일정을 찾을 수 없습니다.");

  await prisma.examSchedule.delete({ where: { id: scheduleId } });
}
