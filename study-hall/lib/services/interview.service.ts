import { cache } from "react";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { normalizeYmMonth, parseUtcDateFromYmd } from "@/lib/date-utils";
import {
  readMockState,
  updateMockState,
  type MockInterviewRecord,
} from "@/lib/mock-store";
import type { InterviewSchemaInput } from "@/lib/interview-schemas";
import type { InterviewResultTypeValue } from "@/lib/interview-meta";
import { getPrismaClient } from "@/lib/service-helpers";

type InterviewActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

export type InterviewItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  date: string;
  trigger: string | null;
  reason: string;
  content: string | null;
  result: string | null;
  resultType: InterviewResultTypeValue;
  createdById: string;
  createdByName: string;
  createdAt: string;
};

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "면담 날짜");
}

function toDateString(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function getMonthRange(month: string) {
  const normalizedMonth = normalizeYmMonth(month, "면담 조회 월");
  const [year, monthValue] = normalizedMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthValue - 1, 1));
  const end = new Date(Date.UTC(year, monthValue, 1));

  return { start, end };
}

function serializeInterviewRecord(
  record: {
    id: string;
    studentId: string;
    date: string | Date;
    trigger: string | null;
    reason: string;
    content: string | null;
    result: string | null;
    resultType: InterviewResultTypeValue;
    createdById: string;
    createdAt: string | Date;
  },
  student: {
    id: string;
    name: string;
    studentNumber: string;
  } | null,
  createdByName: string,
) {
  if (!student) {
    return null;
  }

  return {
    id: record.id,
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.studentNumber,
    date: toDateString(record.date),
    trigger: record.trigger,
    reason: record.reason,
    content: record.content,
    result: record.result,
    resultType: record.resultType,
    createdById: record.createdById,
    createdByName,
    createdAt:
      typeof record.createdAt === "string" ? record.createdAt : record.createdAt.toISOString(),
  } satisfies InterviewItem;
}

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw new Error("직렬 정보를 찾을 수 없습니다.");
  }

  return division;
});

export async function listInterviews(
  divisionSlug: string,
  options?: {
    studentId?: string;
    month?: string;
  },
) {
  if (isMockMode()) {
    const state = await readMockState();
    const students = new Map(
      (state.studentsByDivision[divisionSlug] ?? []).map((student) => [student.id, student]),
    );

    return (state.interviewsByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .filter((record) => !options?.month || record.date.startsWith(options.month))
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .map((record) =>
        serializeInterviewRecord(
          record,
          students.get(record.studentId) ?? null,
          getMockAdminSession(divisionSlug).name,
        ),
      )
      .filter(Boolean) as InterviewItem[];
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const monthRange = options?.month ? getMonthRange(options.month) : null;

  const interviews = await prisma.interview.findMany({
    where: {
      student: {
        divisionId: division.id,
      },
      ...(options?.studentId ? { studentId: options.studentId } : {}),
      ...(monthRange
        ? {
            date: {
              gte: monthRange.start,
              lt: monthRange.end,
            },
          }
        : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentNumber: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return interviews
    .map((record) =>
      serializeInterviewRecord(record, record.student, record.createdBy.name),
    )
    .filter(Boolean) as InterviewItem[];
}

export async function createInterview(
  divisionSlug: string,
  actor: InterviewActor,
  input: InterviewSchemaInput,
) {
  const trigger = normalizeOptionalText(input.trigger);
  const content = normalizeOptionalText(input.content);
  const result = normalizeOptionalText(input.result);
  const reason = normalizeText(input.reason);

  if (isMockMode()) {
    const record = await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }

      const student = (state.studentsByDivision[divisionSlug] ?? []).find(
        (item) => item.id === input.studentId,
      );

      if (!student) {
        throw new Error("학생 정보를 찾을 수 없습니다.");
      }

      const nextRecord: MockInterviewRecord = {
        id: `mock-interview-${divisionSlug}-${Date.now()}`,
        studentId: input.studentId,
        date: input.date,
        trigger,
        reason,
        content,
        result,
        resultType: input.resultType,
        createdById: actor.id,
        createdAt: new Date().toISOString(),
      };

      state.interviewsByDivision[divisionSlug] = [
        nextRecord,
        ...(state.interviewsByDivision[divisionSlug] ?? []),
      ];

      return nextRecord;
    });

    return (await listInterviews(divisionSlug)).find((item) => item.id === record.id) ?? null;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const student = await prisma.student.findFirst({
    where: {
      id: input.studentId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }

  const interview = await prisma.interview.create({
    data: {
      studentId: input.studentId,
      date: parseDateString(input.date),
      trigger,
      reason,
      content,
      result,
      resultType: input.resultType,
      createdById: actor.id,
    },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return serializeInterviewRecord(interview, interview.student, interview.createdBy.name);
}
