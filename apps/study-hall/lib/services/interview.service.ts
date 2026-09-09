import { cache } from "react";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { normalizeYmMonth, parseUtcDateFromYmd } from "@/lib/date-utils";
import { kstDate } from "@/lib/management-policy";
import {
  readMockState,
  updateMockState,
  type MockInterviewRecord,
} from "@/lib/mock-store";
import type {
  InterviewSchemaInput,
  InterviewUpdateSchemaInput,
} from "@/lib/interview-schemas";
import type {
  InterviewResultTypeValue,
  InterviewStatusValue,
} from "@/lib/interview-meta";
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
  followUpDate: string | null;
  status: InterviewStatusValue;
  guardianContacted: boolean;
  closedAt: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
};

export type InterviewListOptions = {
  studentId?: string;
  month?: string;
  status?: InterviewStatusValue;
  /** 후속 확인 예정일이 오늘까지 도래한 진행 중 면담만. month 필터를 무시한다. */
  followUpDue?: boolean;
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

function parseFollowUpDate(value?: string | null) {
  return value ? parseUtcDateFromYmd(value, "후속 확인 예정일") : null;
}

function toDateString(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function toOptionalDateString(value: Date | string | null | undefined) {
  return value ? toDateString(value) : null;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.toISOString();
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
    followUpDate?: string | Date | null;
    status?: InterviewStatusValue | null;
    guardianContacted?: boolean | null;
    closedAt?: string | Date | null;
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
    followUpDate: toOptionalDateString(record.followUpDate),
    // 신규 컬럼이 아직 없는 배포 단계에서도 화면이 깨지지 않도록 기본값을 둔다.
    status: record.status ?? "CLOSED",
    guardianContacted: record.guardianContacted ?? false,
    closedAt: toIsoString(record.closedAt),
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
  options?: InterviewListOptions,
) {
  const today = kstDate();

  if (isMockMode()) {
    const state = await readMockState();
    const students = new Map(
      (state.studentsByDivision[divisionSlug] ?? []).map((student) => [student.id, student]),
    );

    return (state.interviewsByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .filter((record) => !options?.status || record.status === options.status)
      .filter((record) =>
        options?.followUpDue
          ? record.status === "OPEN" && !!record.followUpDate && record.followUpDate <= today
          : !options?.month || record.date.startsWith(options.month),
      )
      .sort((left, right) =>
        options?.followUpDue
          ? (left.followUpDate ?? "").localeCompare(right.followUpDate ?? "")
          : right.date.localeCompare(left.date) ||
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
  // 후속 확인 조회는 월 경계를 넘어 밀린 건까지 보여야 하므로 월 필터를 쓰지 않는다.
  const monthRange = options?.followUpDue || !options?.month ? null : getMonthRange(options.month);

  const interviews = await prisma.interview.findMany({
    where: {
      student: {
        divisionId: division.id,
      },
      ...(options?.studentId ? { studentId: options.studentId } : {}),
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.followUpDue
        ? {
            status: "OPEN" as const,
            followUpDate: {
              not: null,
              lte: parseUtcDateFromYmd(today, "오늘 날짜"),
            },
          }
        : {}),
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
    orderBy: options?.followUpDue
      ? [{ followUpDate: "asc" }]
      : [{ date: "desc" }, { createdAt: "desc" }],
  });

  return interviews
    .map((record) =>
      serializeInterviewRecord(record, record.student, record.createdBy.name),
    )
    .filter(Boolean) as InterviewItem[];
}

export async function countFollowUpDueInterviews(divisionSlug: string) {
  const interviews = await listInterviews(divisionSlug, { followUpDue: true });
  return interviews.length;
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
  const followUpDate = input.followUpDate ?? null;
  const status = input.status ?? "OPEN";
  const closedAt = status === "CLOSED" ? new Date() : null;

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
        followUpDate,
        status,
        guardianContacted: input.guardianContacted ?? false,
        closedAt: closedAt?.toISOString() ?? null,
        closedById: closedAt ? actor.id : null,
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
      followUpDate: parseFollowUpDate(followUpDate),
      status,
      guardianContacted: input.guardianContacted ?? false,
      closedAt,
      closedById: closedAt ? actor.id : null,
      createdById: actor.id,
    },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return serializeInterviewRecord(interview, interview.student, interview.createdBy.name);
}

export async function updateInterview(
  divisionSlug: string,
  interviewId: string,
  actor: InterviewActor,
  input: InterviewUpdateSchemaInput,
) {
  const result = input.result === undefined ? undefined : normalizeOptionalText(input.result);

  if (isMockMode()) {
    const studentId = await updateMockState((state) => {
      const records = state.interviewsByDivision[divisionSlug] ?? [];
      const record = records.find((item) => item.id === interviewId);

      if (!record) {
        throw new Error("면담 기록을 찾을 수 없습니다.");
      }

      if (input.followUpDate !== undefined) {
        record.followUpDate = input.followUpDate;
      }

      if (input.guardianContacted !== undefined) {
        record.guardianContacted = input.guardianContacted;
      }

      if (result !== undefined) {
        record.result = result;
      }

      if (input.status !== undefined && input.status !== record.status) {
        record.status = input.status;
        record.closedAt = input.status === "CLOSED" ? new Date().toISOString() : null;
        record.closedById = input.status === "CLOSED" ? actor.id : null;
      }

      return record.studentId;
    });

    const updated = (await listInterviews(divisionSlug, { studentId })).find(
      (item) => item.id === interviewId,
    );

    if (!updated) {
      throw new Error("면담 기록을 찾을 수 없습니다.");
    }

    return updated;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const existing = await prisma.interview.findFirst({
    where: {
      id: interviewId,
      student: { divisionId: division.id },
    },
    select: { id: true, status: true, studentId: true },
  });

  if (!existing) {
    throw new Error("면담 기록을 찾을 수 없습니다.");
  }

  const isClosing = input.status !== undefined && input.status !== existing.status;

  const interview = await prisma.interview.update({
    where: { id: interviewId },
    data: {
      ...(input.followUpDate !== undefined
        ? { followUpDate: parseFollowUpDate(input.followUpDate) }
        : {}),
      ...(input.guardianContacted !== undefined
        ? { guardianContacted: input.guardianContacted }
        : {}),
      ...(result !== undefined ? { result } : {}),
      ...(isClosing
        ? {
            status: input.status,
            closedAt: input.status === "CLOSED" ? new Date() : null,
            closedById: input.status === "CLOSED" ? actor.id : null,
          }
        : {}),
    },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: existing.studentId });

  const serialized = serializeInterviewRecord(
    interview,
    interview.student,
    interview.createdBy.name,
  );

  if (!serialized) {
    throw new Error("면담 기록을 찾을 수 없습니다.");
  }

  return serialized;
}
