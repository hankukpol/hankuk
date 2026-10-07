import { cache } from "react";
import type { Prisma } from "@prisma/client";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { normalizeYmMonth, parseUtcDateFromYmd } from "@/lib/date-utils";
import { kstDate } from "@/lib/management-policy";
import {
  readMockState,
  updateMockState,
  type MockInterviewRecord,
  type MockInterviewTaskRecord,
} from "@/lib/mock-store";
import type {
  InterviewCreateInput,
  InterviewTaskUpdateInput,
  InterviewUpdateSchemaInput,
} from "@/lib/interview-schemas";
import type { StudyDiagnosis } from "@/lib/study-diagnosis";
import type {
  InterviewResultTypeValue,
  InterviewStatusValue,
} from "@/lib/interview-meta";
import { getPrismaClient, isPrismaSchemaMismatchError } from "@/lib/service-helpers";

type InterviewActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

export type InterviewCategoryValue = "GENERAL" | "STUDY";
export type InterviewTaskStatusValue = "PLANNED" | "DONE" | "PARTIAL" | "NOT_DONE" | "CANCELLED";

/** 학습 면담에서 학생과 정한 할 일(관리자용 전체 모양). */
export type InterviewTaskItem = {
  id: string;
  interviewId: string;
  position: number;
  examCategory: "MORNING" | "REGULAR" | null;
  examTypeId: string | null;
  subjectId: string | null;
  sessionId: string | null;
  subjectName: string;
  examDate: string | null;
  scope: string | null;
  itemNos: number[];
  cause: string;
  title: string;
  method: string | null;
  dueDate: string | null;
  visibleToStudent: boolean;
  baselineMy: number | null;
  baselineAverage: number | null;
  status: InterviewTaskStatusValue;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedInInterviewId: string | null;
};

/**
 * 학생 화면에 내려보내는 할 일. 면담 내용·원인·진단은 넣지 않는다(DEVELOPMENT_CONTRACT §6).
 */
export type StudentVisibleTask = {
  id: string;
  title: string;
  subjectName: string;
  examCategory: "MORNING" | "REGULAR" | null;
  examDate: string | null;
  scope: string | null;
  itemNos: number[];
  method: string | null;
  dueDate: string | null;
  interviewDate: string;
};

/** 학습 면담 저장 때 API 가 서버에서 다시 계산해 넘기는 진단과 이 학원·학생의 시험 범위. */
export type StudyInterviewContext = {
  diagnosis: StudyDiagnosis;
  allowedSubjectIds: Set<string>;
  allowedSessionIds: Set<string>;
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
  category: InterviewCategoryValue;
  /** 학습 면담 저장 당시 진단. 일반 면담이거나 읽을 수 없으면 null. */
  diagnosis: StudyDiagnosis | null;
  tasks: InterviewTaskItem[];
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

type TaskRecordLike = {
  id: string;
  interviewId: string;
  position: number;
  examCategory: "MORNING" | "REGULAR" | null;
  examTypeId: string | null;
  subjectId: string | null;
  sessionId: string | null;
  subjectName: string;
  examDate: string | Date | null;
  scope: string | null;
  itemNos: number[];
  cause: string;
  title: string;
  method: string | null;
  dueDate: string | Date | null;
  visibleToStudent: boolean;
  baselineMy: number | null;
  baselineAverage: number | null;
  status: InterviewTaskStatusValue;
  reviewNote: string | null;
  reviewedAt: string | Date | null;
  reviewedInInterviewId: string | null;
};

function serializeTask(record: TaskRecordLike): InterviewTaskItem {
  return {
    id: record.id,
    interviewId: record.interviewId,
    position: record.position,
    examCategory: record.examCategory,
    examTypeId: record.examTypeId,
    subjectId: record.subjectId,
    sessionId: record.sessionId,
    subjectName: record.subjectName,
    examDate: toOptionalDateString(record.examDate),
    scope: record.scope,
    itemNos: [...record.itemNos],
    cause: record.cause,
    title: record.title,
    method: record.method,
    dueDate: toOptionalDateString(record.dueDate),
    visibleToStudent: record.visibleToStudent,
    baselineMy: record.baselineMy,
    baselineAverage: record.baselineAverage,
    status: record.status,
    reviewNote: record.reviewNote,
    reviewedAt: toIsoString(record.reviewedAt),
    reviewedInInterviewId: record.reviewedInInterviewId,
  };
}

/** 저장된 진단이 지금 모양인지 확인한다. 아니면 화면이 깨지지 않게 null 로 둔다. */
function readDiagnosis(value: unknown): StudyDiagnosis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<StudyDiagnosis>;
  return typeof candidate.version === "number" && candidate.headline && Array.isArray(candidate.priorities) && Array.isArray(candidate.questions)
    ? (candidate as StudyDiagnosis)
    : null;
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
    category?: InterviewCategoryValue | null;
    diagnosisSnapshot?: unknown;
    tasks?: TaskRecordLike[];
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
    category: record.category ?? "GENERAL",
    diagnosis: readDiagnosis(record.diagnosisSnapshot),
    tasks: [...(record.tasks ?? [])].sort((a, b) => a.position - b.position).map(serializeTask),
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
    const tasksByInterview = new Map<string, MockInterviewTaskRecord[]>();
    for (const task of state.interviewTasksByDivision?.[divisionSlug] ?? []) {
      tasksByInterview.set(task.interviewId, [...(tasksByInterview.get(task.interviewId) ?? []), task]);
    }

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
          { ...record, tasks: tasksByInterview.get(record.id) ?? [] },
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

  const where = {
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
  } satisfies Prisma.InterviewWhereInput;
  const orderBy: Prisma.InterviewOrderByWithRelationInput[] = options?.followUpDue
    ? [{ followUpDate: "asc" }]
    : [{ date: "desc" }, { createdAt: "desc" }];
  const relations = {
    student: { select: { id: true, name: true, studentNumber: true } },
    createdBy: { select: { id: true, name: true } },
  } as const;

  try {
    const interviews = await prisma.interview.findMany({
      where,
      include: { ...relations, tasks: { orderBy: { position: "asc" } } },
      orderBy,
    });
    return interviews
      .map((record) => serializeInterviewRecord(record, record.student, record.createdBy.name))
      .filter(Boolean) as InterviewItem[];
  } catch (error) {
    // 학습 면담 마이그레이션(20261007120000) 전의 DB 에서도 기존 면담은 보이게 한다.
    if (!isPrismaSchemaMismatchError(error, ["interview_tasks", "category", "diagnosis_snapshot"])) throw error;
    const interviews = await prisma.interview.findMany({
      where,
      select: {
        id: true, studentId: true, date: true, trigger: true, reason: true, content: true, result: true, resultType: true,
        followUpDate: true, status: true, guardianContacted: true, closedAt: true, createdById: true, createdAt: true,
        ...relations,
      },
      orderBy,
    });
    return interviews
      .map((record) => serializeInterviewRecord(record, record.student, record.createdBy.name))
      .filter(Boolean) as InterviewItem[];
  }
}

export async function countFollowUpDueInterviews(divisionSlug: string) {
  const interviews = await listInterviews(divisionSlug, { followUpDue: true });
  return interviews.length;
}

type PreparedTask = {
  position: number;
  examCategory: "MORNING" | "REGULAR" | null;
  examTypeId: string | null;
  subjectId: string | null;
  sessionId: string | null;
  subjectName: string;
  examDate: string | null;
  scope: string | null;
  itemNos: number[];
  cause: string;
  title: string;
  method: string | null;
  dueDate: string | null;
  visibleToStudent: boolean;
  baselineMy: number | null;
  baselineAverage: number | null;
};

/**
 * 할 일을 저장할 모양으로 바꾼다. 과목·시험이 이 학원 것인지 확인하고, 기준 점수는 서버 진단에서 채운다
 * (브라우저가 보낸 점수는 받지 않는다).
 */
function prepareTasks(input: InterviewCreateInput, study: StudyInterviewContext): PreparedTask[] {
  return (input.tasks ?? []).map((task, position) => {
    if (task.subjectId && !study.allowedSubjectIds.has(task.subjectId)) {
      throw new Error("이 학원의 시험 과목이 아닙니다. 할 일의 과목을 다시 선택해 주세요.");
    }
    if (task.sessionId && !study.allowedSessionIds.has(task.sessionId)) {
      throw new Error("이 학생이 본 시험이 아닙니다. 할 일의 시험을 다시 선택해 주세요.");
    }
    const priority = task.sessionId && task.subjectId
      ? study.diagnosis.priorities.find((row) => row.sessionId === task.sessionId && row.subjectId === task.subjectId)
      : undefined;
    return {
      position,
      examCategory: task.examCategory ?? null,
      examTypeId: normalizeOptionalText(task.examTypeId),
      subjectId: normalizeOptionalText(task.subjectId),
      sessionId: normalizeOptionalText(task.sessionId),
      subjectName: normalizeText(task.subjectName),
      examDate: task.examDate ?? null,
      scope: normalizeOptionalText(task.scope),
      itemNos: Array.from(new Set(task.itemNos ?? [])).sort((a, b) => a - b),
      cause: task.cause,
      title: normalizeText(task.title),
      method: normalizeOptionalText(task.method),
      dueDate: task.dueDate ?? null,
      visibleToStudent: task.visibleToStudent ?? true,
      baselineMy: priority?.baselineMy ?? null,
      baselineAverage: priority?.baselineAverage ?? null,
    };
  });
}

export async function createInterview(
  divisionSlug: string,
  actor: InterviewActor,
  input: InterviewCreateInput,
  study?: StudyInterviewContext,
) {
  const category = input.category ?? "GENERAL";
  if (category === "STUDY" && !study) {
    throw new Error("학습 면담 진단을 계산하지 못했습니다. 잠시 후 다시 저장해 주세요.");
  }
  const trigger = normalizeOptionalText(input.trigger);
  const content = normalizeOptionalText(input.content);
  const result = normalizeOptionalText(input.result);
  const reason = normalizeText(input.reason);
  const followUpDate = input.followUpDate ?? null;
  const status = input.status ?? "OPEN";
  const closedAt = status === "CLOSED" ? new Date() : null;
  // 학습 면담은 경고 단계와 상관이 없으므로 결과 유형을 '면담'으로 고정한다.
  const resultType = category === "STUDY" ? "INTERVIEW" : input.resultType;
  const tasks = category === "STUDY" && study ? prepareTasks(input, study) : [];
  const reviews = category === "STUDY" ? input.reviews ?? [] : [];
  const diagnosisSnapshot = category === "STUDY" && study ? study.diagnosis : null;

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

      const now = new Date().toISOString();
      const nextRecord: MockInterviewRecord = {
        id: `mock-interview-${divisionSlug}-${Date.now()}`,
        studentId: input.studentId,
        date: input.date,
        trigger,
        reason,
        content,
        result,
        resultType,
        followUpDate,
        status,
        guardianContacted: input.guardianContacted ?? false,
        closedAt: closedAt?.toISOString() ?? null,
        closedById: closedAt ? actor.id : null,
        createdById: actor.id,
        createdAt: now,
        category,
        diagnosisSnapshot,
      };

      // 학습 면담 이전에 만든 목업 파일에는 할 일 칸이 없을 수 있다.
      state.interviewTasksByDivision ??= {};
      const existingTasks = state.interviewTasksByDivision[divisionSlug] ?? [];
      // 지난 할 일 확인: 같은 학원·같은 학생의 할 일만 바꾼다.
      for (const review of reviews) {
        const task = existingTasks.find((item) => item.id === review.taskId && item.studentId === input.studentId);
        if (!task) throw new Error("확인할 지난 할 일을 찾을 수 없습니다.");
        task.status = review.status;
        task.reviewNote = normalizeOptionalText(review.note);
        task.reviewedAt = now;
        task.reviewedById = actor.id;
        task.reviewedInInterviewId = nextRecord.id;
        task.updatedAt = now;
      }

      state.interviewsByDivision[divisionSlug] = [
        nextRecord,
        ...(state.interviewsByDivision[divisionSlug] ?? []),
      ];
      state.interviewTasksByDivision[divisionSlug] = [
        ...existingTasks,
        ...tasks.map((task) => ({
          ...task,
          id: `mock-interview-task-${divisionSlug}-${Date.now()}-${task.position}`,
          divisionId: division.id,
          interviewId: nextRecord.id,
          studentId: input.studentId,
          status: "PLANNED" as const,
          reviewNote: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedInInterviewId: null,
          createdAt: now,
          updatedAt: now,
        })),
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

  const interview = await prisma.$transaction(async (tx) => {
    const created = await tx.interview.create({
      data: {
        studentId: input.studentId,
        date: parseDateString(input.date),
        trigger,
        reason,
        content,
        result,
        resultType,
        followUpDate: parseFollowUpDate(followUpDate),
        status,
        guardianContacted: input.guardianContacted ?? false,
        closedAt,
        closedById: closedAt ? actor.id : null,
        createdById: actor.id,
        // 일반 면담은 새 칸을 쓰지 않는다. 학습 면담 마이그레이션 전 DB 에서도 일반 면담 저장은 그대로 된다.
        ...(category === "STUDY"
          ? { category, diagnosisSnapshot: diagnosisSnapshot as unknown as Prisma.InputJsonValue }
          : {}),
      },
      select: { id: true },
    });

    if (tasks.length) {
      await tx.interviewTask.createMany({
        data: tasks.map((task) => ({
          ...task,
          examDate: task.examDate ? parseUtcDateFromYmd(task.examDate, "시험일") : null,
          dueDate: task.dueDate ? parseUtcDateFromYmd(task.dueDate, "할 일 기한") : null,
          divisionId: division.id,
          interviewId: created.id,
          studentId: input.studentId,
        })),
      });
    }

    if (reviews.length) {
      const owned = await tx.interviewTask.findMany({
        where: { id: { in: reviews.map((review) => review.taskId) }, studentId: input.studentId, divisionId: division.id },
        select: { id: true },
      });
      if (owned.length !== new Set(reviews.map((review) => review.taskId)).size) {
        throw new Error("확인할 지난 할 일을 찾을 수 없습니다.");
      }
      const reviewedAt = new Date();
      for (const review of reviews) {
        await tx.interviewTask.update({
          where: { id: review.taskId },
          data: {
            status: review.status,
            reviewNote: normalizeOptionalText(review.note),
            reviewedAt,
            reviewedById: actor.id,
            reviewedInInterviewId: created.id,
          },
        });
      }
    }

    return created;
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return (await listInterviews(divisionSlug, { studentId: input.studentId })).find((item) => item.id === interview.id) ?? null;
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

/** 할 일 하나의 상태·공개 여부·확인 메모를 바꾼다. 같은 학원의 할 일만 바꿀 수 있다. */
export async function updateInterviewTask(
  divisionSlug: string,
  taskId: string,
  actor: InterviewActor,
  input: InterviewTaskUpdateInput,
): Promise<InterviewTaskItem> {
  const reviewNote = input.reviewNote === undefined ? undefined : normalizeOptionalText(input.reviewNote);

  if (isMockMode()) {
    const task = await updateMockState((state) => {
      const record = (state.interviewTasksByDivision?.[divisionSlug] ?? []).find((item) => item.id === taskId);
      if (!record) throw new Error("할 일을 찾을 수 없습니다.");
      const now = new Date().toISOString();
      if (input.status !== undefined && input.status !== record.status) {
        record.status = input.status;
        record.reviewedAt = now;
        record.reviewedById = actor.id;
      }
      if (input.visibleToStudent !== undefined) record.visibleToStudent = input.visibleToStudent;
      if (reviewNote !== undefined) record.reviewNote = reviewNote;
      record.updatedAt = now;
      return { ...record };
    });
    return serializeTask(task);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const existing = await prisma.interviewTask.findFirst({
    where: { id: taskId, divisionId: division.id },
    select: { id: true, status: true, studentId: true },
  });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다.");

  const updated = await prisma.interviewTask.update({
    where: { id: taskId },
    data: {
      ...(input.status !== undefined && input.status !== existing.status
        ? { status: input.status, reviewedAt: new Date(), reviewedById: actor.id }
        : {}),
      ...(input.visibleToStudent !== undefined ? { visibleToStudent: input.visibleToStudent } : {}),
      ...(reviewNote !== undefined ? { reviewNote } : {}),
    },
  });
  revalidateDivisionOperationalViews(divisionSlug, { studentId: existing.studentId });
  return serializeTask(updated);
}

/**
 * 학생에게 보이는 "선생님과 정한 이번 주 할 일". 할 일이 있는 가장 최근 학습 면담에서
 * 공개로 표시했고 아직 확인 전(PLANNED)인 것만, 학생용 좁은 모양으로 돌려준다.
 */
export async function listStudentVisibleTasks(divisionSlug: string, studentId: string): Promise<StudentVisibleTask[]> {
  let interviews: InterviewItem[];
  try {
    interviews = await listInterviews(divisionSlug, { studentId });
  } catch {
    return [];
  }
  const latest = interviews
    .filter((interview) => interview.category === "STUDY" && interview.tasks.length)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return [];
  return latest.tasks
    .filter((task) => task.visibleToStudent && task.status === "PLANNED")
    .map((task) => ({
      id: task.id,
      title: task.title,
      subjectName: task.subjectName,
      examCategory: task.examCategory,
      examDate: task.examDate,
      scope: task.scope,
      itemNos: task.itemNos,
      method: task.method,
      dueDate: task.dueDate,
      interviewDate: latest.date,
    }));
}
