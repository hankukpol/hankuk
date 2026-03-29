import {
  AttendType,
  ExamType,
  Prisma,
  ScoreSource,
  StudentType,
  Subject,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import {
  preserveAbsenceNoteSystemNote,
  withAbsenceNoteDisplay,
} from "@/lib/absence-notes/system-note";
import {
  getAdminAcademyScope,
  requireVisibleAcademyId,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import {
  parseOfflineAnalysisQuestions,
  parseOfflineScoreImport,
  parseOnlineOxScoreImport,
  parseOnlineScoreImport,
  parseScorePasteImport,
  type ParsedOfflineScoreImport,
  type ParsedQuestionRecord,
  type ParsedScoreImport,
} from "@/lib/scores/parser";
import {
  applyDuplicateResolvedStudentIssues,
  dedupeByKey,
  dedupeScoreWriteRecords,
  dedupeStudentAnswerWriteRecords,
  type ScoreWriteRecord,
  type StudentAnswerWriteRecord,
} from "@/lib/scores/import-safety";
import { shouldCreateDailyPoliceOxSession } from "@/lib/exam-session-rules";

export const SCORE_SESSION_LOCKED_MESSAGE = "잠금된 회차입니다.";

type StudentMatchRecord = {
  examNumber: string;
  name: string;
  onlineId: string | null;
  isActive: boolean;
};

export type ScoreFilters = {
  sessionId?: number;
  periodId?: number;
  examType?: ExamType;
  week?: number;
  subject?: Subject;
  examNumber?: string;
  query?: string; // 이름 또는 수험번호 통합 검색
  date?: Date;
};

export type ScoreResolutionInput = Record<
  string,
  {
    examNumber?: string;
    bindOnlineId?: boolean;
  }
>;

export type ScorePreviewRow = {
  rowKey: string;
  rowNumber: number;
  examNumber: string | null;
  name: string;
  onlineId: string | null;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  sourceType: ScoreSource;
  note: string | null;
  status: "ready" | "overwrite" | "resolve" | "invalid";
  matchedBy: "examNumber" | "onlineId" | "name" | "manual" | null;
  matchedStudent: StudentMatchRecord | null;
  candidates: StudentMatchRecord[];
  issues: string[];
  bindOnlineIdSuggested: boolean;
  bindOnlineId: boolean;
  hasExistingScore: boolean;
  willCreateStudent: boolean;
};

export type ScorePreviewResult = {
  sourceType: ScoreSource;
  session: {
    id: number;
    periodId: number;
    periodName: string;
    examType: ExamType;
    week: number;
    subject: Subject;
    examDate: string;
    isCancelled: boolean;
    isLocked: boolean;
  };
  rows: ScorePreviewRow[];
  summary: {
    totalRows: number;
    readyRows: number;
    overwriteRows: number;
    resolveRows: number;
    invalidRows: number;
    questionCount: number;
    answerCount: number;
  };
  metadata: Record<string, unknown>;
};

type ExistingScoreSnapshot = {
  examNumber: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  sourceType: ScoreSource;
  note: string | null;
};

const SCORE_IMPORT_WRITE_CONCURRENCY = 2;
const SCORE_IMPORT_WRITE_BATCH_SIZE = 100;
const SCORE_IMPORT_STATEMENT_TIMEOUT_MS = 300_000;
const SCORE_IMPORT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 600_000,
} as const;
const SCORE_IMPORT_TIMEOUT_RETRY_COUNT = 3;
const SCORE_IMPORT_TIMEOUT_RETRY_DELAY_MS = 1_500;

const OX_LINK_UNAVAILABLE_MESSAGE =
  "선택한 회차에는 경찰학 OX를 연동할 수 없습니다. 목요일 누적 모의고사와 OX 시작 전 회차는 제외됩니다.";

function normalizeName(value: string) {
  return value.replace(/\s+/g, "");
}

function computeFinalScore(rawScore: number | null, oxScore: number | null, finalScore: number | null) {
  if (rawScore !== null || oxScore !== null) {
    return (rawScore ?? 0) + (oxScore ?? 0);
  }

  return finalScore;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) {
    return;
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

function chunkItems<T>(items: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isStatementTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("57014") || message.includes("statement timeout");
}

function hasSameScoreWrite(
  existing:
    | Pick<
        ScoreWriteRecord,
        "rawScore" | "oxScore" | "finalScore" | "attendType" | "sourceType" | "note"
      >
    | null
    | undefined,
  incoming: Pick<
    ScoreWriteRecord,
    "rawScore" | "oxScore" | "finalScore" | "attendType" | "sourceType" | "note"
  >,
) {
  return Boolean(
    existing &&
      existing.rawScore === incoming.rawScore &&
      existing.oxScore === incoming.oxScore &&
      existing.finalScore === incoming.finalScore &&
      existing.attendType === incoming.attendType &&
      existing.sourceType === incoming.sourceType &&
      existing.note === incoming.note,
  );
}

function sortScoreWriteRecords(rows: readonly ScoreWriteRecord[]) {
  return [...rows].sort(
    (left, right) =>
      left.sessionId - right.sessionId || left.examNumber.localeCompare(right.examNumber),
  );
}

function sortStudentAnswerWriteRecords(rows: readonly StudentAnswerWriteRecord[]) {
  return [...rows].sort(
    (left, right) =>
      left.questionId - right.questionId || left.examNumber.localeCompare(right.examNumber),
  );
}

async function executeScoreWriteBatch(
  prisma: ReturnType<typeof getPrisma>,
  batch: readonly ScoreWriteRecord[],
) {
  await prisma.$transaction(
    async (tx) => {
      await Promise.all(
        batch.map((row) =>
          tx.score.upsert({
            where: {
              examNumber_sessionId: {
                examNumber: row.examNumber,
                sessionId: row.sessionId,
              },
            },
            create: {
              academyId: row.academyId ?? null,
              examNumber: row.examNumber,
              sessionId: row.sessionId,
              rawScore: row.rawScore,
              oxScore: row.oxScore,
              finalScore: row.finalScore,
              attendType: row.attendType,
              sourceType: row.sourceType,
              note: row.note,
            },
            update: {
              academyId: row.academyId ?? null,
              rawScore: row.rawScore,
              oxScore: row.oxScore,
              finalScore: row.finalScore,
              attendType: row.attendType,
              sourceType: row.sourceType,
              note: row.note,
            },
          }),
        ),
      );
    },
    SCORE_IMPORT_TRANSACTION_OPTIONS,
  );
}
async function upsertScoreWriteBatch(
  prisma: ReturnType<typeof getPrisma>,
  batch: readonly ScoreWriteRecord[],
  retryCount = SCORE_IMPORT_TIMEOUT_RETRY_COUNT,
): Promise<void> {
  try {
    await executeScoreWriteBatch(prisma, batch);
  } catch (error) {
    if (!isStatementTimeoutError(error)) {
      throw error;
    }

    if (batch.length > 1) {
      const middleIndex = Math.ceil(batch.length / 2);
      await upsertScoreWriteBatch(prisma, batch.slice(0, middleIndex));
      await upsertScoreWriteBatch(prisma, batch.slice(middleIndex));
      return;
    }

    if (retryCount > 0) {
      const attempt = SCORE_IMPORT_TIMEOUT_RETRY_COUNT - retryCount + 1;
      await delay(SCORE_IMPORT_TIMEOUT_RETRY_DELAY_MS * attempt);
      await upsertScoreWriteBatch(prisma, batch, retryCount - 1);
      return;
    }

    throw new Error(
      "DB가 같은 성적 데이터를 다른 작업으로 점유 중입니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}

async function bulkUpsertScores(
  prisma: ReturnType<typeof getPrisma>,
  rows: readonly ScoreWriteRecord[],
) {
  const dedupedRows = sortScoreWriteRecords(dedupeScoreWriteRecords(rows));
  const batches = chunkItems(dedupedRows, SCORE_IMPORT_WRITE_BATCH_SIZE);

  await runWithConcurrency(batches, SCORE_IMPORT_WRITE_CONCURRENCY, (batch) =>
    upsertScoreWriteBatch(prisma, batch),
  );
}

async function executeStudentAnswerWriteBatch(
  prisma: ReturnType<typeof getPrisma>,
  batch: readonly StudentAnswerWriteRecord[],
) {
  await prisma.$transaction(
    async (tx) => {
      await Promise.all(
        batch.map((row) =>
          tx.studentAnswer.upsert({
            where: {
              examNumber_questionId: {
                examNumber: row.examNumber,
                questionId: row.questionId,
              },
            },
            create: {
              examNumber: row.examNumber,
              questionId: row.questionId,
              answer: row.answer,
              isCorrect: row.isCorrect,
            },
            update: {
              answer: row.answer,
              isCorrect: row.isCorrect,
            },
          }),
        ),
      );
    },
    SCORE_IMPORT_TRANSACTION_OPTIONS,
  );
}
async function upsertStudentAnswerWriteBatch(
  prisma: ReturnType<typeof getPrisma>,
  batch: readonly StudentAnswerWriteRecord[],
  retryCount = SCORE_IMPORT_TIMEOUT_RETRY_COUNT,
): Promise<void> {
  try {
    await executeStudentAnswerWriteBatch(prisma, batch);
  } catch (error) {
    if (!isStatementTimeoutError(error)) {
      throw error;
    }

    if (batch.length > 1) {
      const middleIndex = Math.ceil(batch.length / 2);
      await upsertStudentAnswerWriteBatch(prisma, batch.slice(0, middleIndex));
      await upsertStudentAnswerWriteBatch(prisma, batch.slice(middleIndex));
      return;
    }

    if (retryCount > 0) {
      const attempt = SCORE_IMPORT_TIMEOUT_RETRY_COUNT - retryCount + 1;
      await delay(SCORE_IMPORT_TIMEOUT_RETRY_DELAY_MS * attempt);
      await upsertStudentAnswerWriteBatch(prisma, batch, retryCount - 1);
      return;
    }

    throw new Error(
      "DB가 같은 답안 데이터를 다른 작업으로 점유 중입니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}

async function bulkUpsertStudentAnswers(
  prisma: ReturnType<typeof getPrisma>,
  rows: readonly StudentAnswerWriteRecord[],
) {
  const dedupedRows = sortStudentAnswerWriteRecords(
    dedupeStudentAnswerWriteRecords(rows),
  );

  const batches = chunkItems(dedupedRows, SCORE_IMPORT_WRITE_BATCH_SIZE);
  await runWithConcurrency(batches, SCORE_IMPORT_WRITE_CONCURRENCY, (batch) =>
    upsertStudentAnswerWriteBatch(prisma, batch),
  );
}

async function recalculateScoreStatusCache(
  periodId: number,
  examType: ExamType,
  options?: { examNumbers?: string[] },
) {
  const { recalculateStatusCache } = await import("@/lib/analytics/service");
  return recalculateStatusCache(periodId, examType, options);
}

function mergeImportedScore(
  existing: ExistingScoreSnapshot | null | undefined,
  incoming: Pick<ScorePreviewRow, "rawScore" | "oxScore" | "finalScore">,
) {
  const rawScore = incoming.rawScore ?? existing?.rawScore ?? null;
  const oxScore = incoming.oxScore ?? existing?.oxScore ?? null;
  const finalScore = computeFinalScore(
    rawScore,
    oxScore,
    incoming.finalScore ?? existing?.finalScore ?? null,
  );

  return {
    rawScore,
    oxScore,
    finalScore,
  };
}

function canAutoCreateStudent(
  parsed: ParsedScoreImport,
  record: ParsedScoreImport["records"][number],
  candidates: StudentMatchRecord[],
) {
  return (
    parsed.matchingKey === "examNumber" &&
    Boolean(record.examNumber) &&
    Boolean(record.name) &&
    candidates.length === 0
  );
}

function mergeQuestionRecords(
  baseQuestions: ParsedQuestionRecord[],
  overrideQuestions: ParsedQuestionRecord[] = [],
) {
  const merged = new Map<number, ParsedQuestionRecord>();

  for (const question of baseQuestions) {
    merged.set(question.questionNo, question);
  }

  for (const question of overrideQuestions) {
    const existing = merged.get(question.questionNo);
    merged.set(question.questionNo, {
      questionNo: question.questionNo,
      correctAnswer: question.correctAnswer || existing?.correctAnswer || "",
      correctRate: question.correctRate ?? existing?.correctRate ?? null,
      answerDistribution: question.answerDistribution ?? existing?.answerDistribution ?? null,
      difficulty: question.difficulty ?? existing?.difficulty ?? null,
    });
  }

  return Array.from(merged.values()).sort((left, right) => left.questionNo - right.questionNo);
}

function assertSessionUnlocked(session: { isLocked: boolean }) {
  if (session.isLocked) {
    throw new Error(SCORE_SESSION_LOCKED_MESSAGE);
  }
}

async function resolveVisibleScoreAcademyId() {
  const scope = await getAdminAcademyScope();
  return resolveVisibleAcademyId(scope);
}

async function requireVisibleScoreWriteAcademyId() {
  const scope = await getAdminAcademyScope();
  return requireVisibleAcademyId(scope);
}

async function getSessionOrThrow(sessionId: number, academyId?: number | null) {
  const resolvedAcademyId = academyId === undefined ? await resolveVisibleScoreAcademyId() : academyId;

  return getPrisma().examSession.findFirstOrThrow({
    where: {
      id: sessionId,
      ...(resolvedAcademyId === null
        ? {}
        : {
            period: {
              academyId: resolvedAcademyId,
            },
          }),
    },
    include: {
      period: true,
    },
  });
}
async function resolveOxSessionId(
  sessionId: number,
  explicitOxSessionId?: number,
  academyId?: number | null,
) {
  const session = await getSessionOrThrow(sessionId, academyId);
  const resolvedAcademyId = academyId === undefined ? session.period.academyId ?? null : academyId;

  if (session.subject === Subject.POLICE_SCIENCE) {
    return session.id;
  }

  if (session.subject === Subject.CUMULATIVE) {
    return undefined;
  }

  const firstPoliceSession = await getPrisma().examSession.findFirst({
    where: {
      periodId: session.periodId,
      examType: session.examType,
      subject: Subject.POLICE_SCIENCE,
      isCancelled: false,
      ...(resolvedAcademyId === null
        ? {}
        : {
            period: {
              academyId: resolvedAcademyId,
            },
          }),
    },
    orderBy: {
      examDate: "asc",
    },
    select: {
      examDate: true,
    },
  });

  if (
    !shouldCreateDailyPoliceOxSession(
      session.subject,
      session.examDate,
      firstPoliceSession?.examDate ?? null,
    )
  ) {
    return undefined;
  }

  if (explicitOxSessionId) {
    const explicitSession = await getPrisma().examSession.findFirst({
      where: {
        id: explicitOxSessionId,
        ...(resolvedAcademyId === null
          ? {}
          : {
              period: {
                academyId: resolvedAcademyId,
              },
            }),
      },
      select: {
        periodId: true,
        examType: true,
        subject: true,
        isCancelled: true,
      },
    });

    if (
      !explicitSession ||
      explicitSession.periodId !== session.periodId ||
      explicitSession.examType !== session.examType ||
      explicitSession.subject !== Subject.POLICE_SCIENCE ||
      explicitSession.isCancelled
    ) {
      throw new Error(OX_LINK_UNAVAILABLE_MESSAGE);
    }

    return explicitOxSessionId;
  }

  const policeSession = await getPrisma().examSession.findFirst({
    where: {
      periodId: session.periodId,
      examType: session.examType,
      examDate: session.examDate,
      subject: Subject.POLICE_SCIENCE,
      isCancelled: false,
      ...(resolvedAcademyId === null
        ? {}
        : {
            period: {
              academyId: resolvedAcademyId,
            },
          }),
    },
    select: {
      id: true,
    },
  });

  return policeSession?.id;
}
async function loadStudentMatches(examType: ExamType, periodId: number, academyId?: number | null) {
  const resolvedAcademyId = academyId === undefined ? await resolveVisibleScoreAcademyId() : academyId;

  const students = await getPrisma().student.findMany({
    where: {
      examType,
      ...(resolvedAcademyId === null ? {} : { academyId: resolvedAcademyId }),
      OR: [
        {
          enrollments: {
            some: {
              periodId,
            },
          },
        },
        {
          scores: {
            some: {
              session: {
                periodId,
                examType,
              },
            },
          },
        },
        {
          absenceNotes: {
            some: {
              session: {
                periodId,
                examType,
              },
            },
          },
        },
        {
          pointLogs: {
            some: {
              periodId,
            },
          },
        },
      ],
    },
    select: {
      examNumber: true,
      name: true,
      onlineId: true,
      isActive: true,
    },
    orderBy: {
      examNumber: "asc",
    },
  });

  const byExamNumber = new Map(students.map((student) => [student.examNumber, student]));
  const byOnlineId = new Map(
    students
      .filter((student) => student.onlineId)
      .map((student) => [String(student.onlineId), student]),
  );
  const byName = new Map<string, StudentMatchRecord[]>();

  for (const student of students) {
    const key = normalizeName(student.name);
    const current = byName.get(key) ?? [];
    current.push(student);
    byName.set(key, current);
  }

  return {
    students,
    byExamNumber,
    byOnlineId,
    byName,
  };
}
function duplicateCounts(parsed: ParsedScoreImport) {
  const counts = new Map<string, number>();

  for (const record of parsed.records) {
    const key =
      parsed.matchingKey === "examNumber" ? record.examNumber : record.onlineId;

    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

async function buildPreview(
  sessionId: number,
  parsed: ParsedScoreImport,
  resolutions: ScoreResolutionInput = {},
  academyId?: number | null,
) {
  const session = await getSessionOrThrow(sessionId, academyId);
  const students = await loadStudentMatches(session.examType, session.period.id, academyId);
  const existingScores = await getPrisma().score.findMany({
    where: {
      sessionId,
    },
        select: {
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      attendType: true,
      sourceType: true,
      note: true,
    },
  });
  const existingScoreMap = new Map(existingScores.map((score) => [score.examNumber, score]));
  const counts = duplicateCounts(parsed);

  const rows = parsed.records.map((record) => {
    const issues: string[] = [];
    const candidates: StudentMatchRecord[] = [];
    let matchedStudent: StudentMatchRecord | null = null;
    let matchedBy: ScorePreviewRow["matchedBy"] = null;
    let willCreateStudent = false;

    if (parsed.matchingKey === "examNumber") {
      if (!record.examNumber) {
        issues.push("수험번호가 없습니다.");
      }
    } else if (!record.onlineId) {
      issues.push("온라인 ID가 없습니다.");
    }

    if (
      record.rawScore === null &&
      record.oxScore === null &&
      record.finalScore === null
    ) {
      issues.push("점수를 읽을 수 없습니다.");
    }

    const duplicateKey =
      parsed.matchingKey === "examNumber" ? record.examNumber : record.onlineId;

    if (duplicateKey && (counts.get(duplicateKey) ?? 0) > 1) {
      issues.push("입력 데이터에 동일 키가 중복되어 있습니다.");
    }

    if (issues.length === 0) {
      if (parsed.matchingKey === "examNumber" && record.examNumber) {
        matchedStudent = students.byExamNumber.get(record.examNumber) ?? null;
        matchedBy = matchedStudent ? "examNumber" : null;
      }

      if (!matchedStudent && parsed.matchingKey === "onlineId" && record.onlineId) {
        matchedStudent = students.byOnlineId.get(record.onlineId) ?? null;
        matchedBy = matchedStudent ? "onlineId" : null;
      }

      const resolution = resolutions[record.rowKey];

      if (!matchedStudent && resolution?.examNumber) {
        matchedStudent = students.byExamNumber.get(resolution.examNumber) ?? null;
        matchedBy = matchedStudent ? "manual" : null;
      }

      if (!matchedStudent && record.name) {
        candidates.push(...(students.byName.get(normalizeName(record.name)) ?? []));

        if (candidates.length === 1) {
          matchedStudent = candidates[0];
          matchedBy = "name";
        }
      }

      if (!matchedStudent && canAutoCreateStudent(parsed, record, candidates)) {
        matchedStudent = {
          examNumber: record.examNumber!,
          name: record.name,
          onlineId: null,
          isActive: true,
        };
        matchedBy = "examNumber";
        willCreateStudent = true;
      }

      if (!matchedStudent && parsed.matchingKey === "examNumber") {
        issues.push("등록된 수강생을 찾을 수 없습니다.");
      }

      if (!matchedStudent && parsed.matchingKey === "onlineId" && candidates.length === 0) {
        issues.push("온라인 ID 또는 이름으로 매칭되는 수강생이 없습니다.");
      }
    }

    const existingScore = matchedStudent
      ? existingScoreMap.get(matchedStudent.examNumber) ?? null
      : null;
    const mergedScore = mergeImportedScore(existingScore, record);
    const hasExistingScore = Boolean(existingScore);
    const bindOnlineIdSuggested = Boolean(
      matchedBy === "name" && record.onlineId && matchedStudent && !matchedStudent.onlineId,
    );
    const bindOnlineId = Boolean(
      record.onlineId && (resolutions[record.rowKey]?.bindOnlineId ?? bindOnlineIdSuggested),
    );

    let status: ScorePreviewRow["status"] = "invalid";

    if (issues.length > 0) {
      status = "invalid";
    } else if (!matchedStudent && candidates.length > 1) {
      status = "resolve";
    } else if (matchedStudent && hasExistingScore) {
      status = "overwrite";
    } else if (matchedStudent) {
      status = "ready";
    }

    return {
      rowKey: record.rowKey,
      rowNumber: record.rowNumber,
      examNumber: matchedStudent?.examNumber ?? record.examNumber,
      name: record.name,
      onlineId: record.onlineId,
      rawScore: mergedScore.rawScore,
      oxScore: mergedScore.oxScore,
      finalScore: mergedScore.finalScore,
      attendType: record.attendType,
      sourceType: record.sourceType,
      note: record.note,
      status,
      matchedBy,
      matchedStudent,
      candidates,
      issues,
      bindOnlineIdSuggested,
      bindOnlineId,
      hasExistingScore,
      willCreateStudent,
    } satisfies ScorePreviewRow;
  });

  const sanitizedRows = applyDuplicateResolvedStudentIssues(rows);

  return {
    sourceType: parsed.sourceType,
    session: {
      id: session.id,
      periodId: session.periodId,
      periodName: session.period.name,
      examType: session.examType,
      week: session.week,
      subject: session.subject,
      examDate: session.examDate.toISOString(),
      isCancelled: session.isCancelled,
      isLocked: session.isLocked,
    },
    rows: sanitizedRows,
    summary: {
      totalRows: sanitizedRows.length,
      readyRows: sanitizedRows.filter((row) => row.status === "ready").length,
      overwriteRows: sanitizedRows.filter((row) => row.status === "overwrite").length,
      resolveRows: sanitizedRows.filter((row) => row.status === "resolve").length,
      invalidRows: sanitizedRows.filter((row) => row.status === "invalid").length,
      questionCount: parsed.questions.length,
      answerCount: parsed.answers.length,
    },
    metadata: parsed.metadata,
  } satisfies ScorePreviewResult;
}

type QuestionStatRecord = {
  questionNo: number;
  correctAnswer: string;
  correctRate: number | null;
  difficulty: string | null;
  answerDistribution: Prisma.InputJsonValue;
  answers: Array<{
    examNumber: string;
    answer: string;
    isCorrect: boolean;
  }>;
};

function buildQuestionStats(
  parsed: ParsedScoreImport,
  resolvedRows: ScorePreviewRow[],
) {
  const keyToExamNumber = new Map<string, string>();

  for (const row of resolvedRows) {
    const studentKey =
      parsed.matchingKey === "examNumber" ? row.examNumber : row.onlineId;

    if (studentKey && row.matchedStudent) {
      keyToExamNumber.set(studentKey, row.matchedStudent.examNumber);
    }
  }

  return parsed.questions.map((question) => {
    const answers = dedupeByKey(
      parsed.answers
        .filter((answer) => answer.questionNo === question.questionNo)
        .flatMap((answer) => {
          const examNumber = keyToExamNumber.get(answer.studentKey);

          if (!examNumber) {
            return [];
          }

          const normalizedAnswer = answer.answer;
          return {
            examNumber,
            answer: normalizedAnswer,
            isCorrect: normalizedAnswer === question.correctAnswer,
          };
        }),
      (answer) => answer.examNumber,
    );

    const distributionCounts = answers.reduce<Record<string, number>>((accumulator, answer) => {
      accumulator[answer.answer] = (accumulator[answer.answer] ?? 0) + 1;
      return accumulator;
    }, {});
    const totalAnswers = answers.length;
    const answerDistribution = Object.fromEntries(
      Object.entries(distributionCounts).map(([answer, count]) => [
        answer,
        totalAnswers === 0 ? 0 : roundToOneDecimal((count / totalAnswers) * 100),
      ]),
    );
    const correctCount = answers.filter((answer) => answer.isCorrect).length;

    return {
      questionNo: question.questionNo,
      correctAnswer: question.correctAnswer,
      correctRate:
        question.correctRate ??
        (totalAnswers === 0
          ? null
          : roundToOneDecimal((correctCount / totalAnswers) * 100)),
      difficulty: question.difficulty,
      answerDistribution: JSON.parse(
        JSON.stringify(question.answerDistribution ?? answerDistribution),
      ) as Prisma.InputJsonValue,
      answers,
    } satisfies QuestionStatRecord;
  });
}

async function provisionStudentsForRows(
  prisma: ReturnType<typeof getPrisma>,
  preview: ScorePreviewResult,
  rows: ScorePreviewRow[],
  academyId: number,
) {
  const provisionTargets = Array.from(
    new Map(
      rows
        .filter((row) => row.willCreateStudent && row.matchedStudent)
        .map((row) => [
          row.matchedStudent!.examNumber,
          {
            examNumber: row.matchedStudent!.examNumber,
            name: row.name || row.matchedStudent!.name,
            onlineId: row.onlineId ?? null,
          },
        ]),
    ).values(),
  );

  if (provisionTargets.length === 0) {
    return 0;
  }

  await prisma.student.createMany({
    data: provisionTargets.map((student) => ({
      academyId,
      examNumber: student.examNumber,
      name: student.name,
      examType: preview.session.examType,
      studentType: StudentType.EXISTING,
      onlineId: student.onlineId,
    })),
    skipDuplicates: true,
  });

  await prisma.periodEnrollment.createMany({
    data: provisionTargets.map((student) => ({
      periodId: preview.session.periodId,
      examNumber: student.examNumber,
    })),
    skipDuplicates: true,
  });

  return provisionTargets.length;
}
async function applyParsedImport(input: {
  adminId: string;
  sessionId: number;
  parsed: ParsedScoreImport;
  resolutions?: ScoreResolutionInput;
  ipAddress?: string | null;
}) {
  const academyId = await requireVisibleScoreWriteAcademyId();
  const preview = await buildPreview(input.sessionId, input.parsed, input.resolutions, academyId);
  const resolvedRows = preview.rows.filter(
    (row) =>
      (row.status === "ready" || row.status === "overwrite") &&
      row.matchedStudent,
  );

  if (preview.session.isCancelled) {
    throw new Error("취소된 시험 회차에는 성적을 반영할 수 없습니다.");
  }

  if (preview.session.isLocked) {
    throw new Error(SCORE_SESSION_LOCKED_MESSAGE);
  }

  if (resolvedRows.length === 0) {
    throw new Error("반영 가능한 성적 행이 없습니다.");
  }

  const prisma = getPrisma();
  const autoCreatedStudentCount = await provisionStudentsForRows(prisma, preview, resolvedRows, academyId);

  const existingScores = await prisma.score.findMany({
    where: {
      sessionId: input.sessionId,
      examNumber: {
        in: resolvedRows
          .map((row) => row.matchedStudent?.examNumber)
          .filter((value): value is string => Boolean(value)),
      },
    },
    select: {
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      attendType: true,
      sourceType: true,
      note: true,
    },
  });
  const existingScoreMap = new Map(existingScores.map((score) => [score.examNumber, score]));

  const scoreWrites = dedupeScoreWriteRecords(
    resolvedRows.flatMap((row) => {
      const matchedStudent = row.matchedStudent;
      if (!matchedStudent) {
        return [];
      }

      const existingScore = existingScoreMap.get(matchedStudent.examNumber);
      const mergedScore = mergeImportedScore(existingScore, row);
      const nextWrite = {
        academyId,
        examNumber: matchedStudent.examNumber,
        sessionId: input.sessionId,
        rawScore: mergedScore.rawScore,
        oxScore: mergedScore.oxScore,
        finalScore: mergedScore.finalScore,
        attendType: row.attendType,
        sourceType: row.sourceType,
        note: row.note ?? null,
      } satisfies ScoreWriteRecord;

      if (hasSameScoreWrite(existingScore, nextWrite)) {
        return [];
      }

      return [nextWrite];
    }),
  );

  await bulkUpsertScores(prisma, scoreWrites);

  const createdCount = scoreWrites.filter((row) => !existingScoreMap.has(row.examNumber)).length;
  const updatedCount = scoreWrites.length - createdCount;
  const affectedExamNumbers = Array.from(new Set(scoreWrites.map((row) => row.examNumber)));

  const bindRows = resolvedRows.filter(
    (row) =>
      row.sourceType === ScoreSource.ONLINE_UPLOAD &&
      row.onlineId &&
      row.bindOnlineId &&
      row.matchedStudent &&
      row.matchedStudent.onlineId !== row.onlineId,
  );
  await runWithConcurrency(bindRows, SCORE_IMPORT_WRITE_CONCURRENCY, async (row) => {
    await prisma.student.update({
      where: { examNumber: row.matchedStudent!.examNumber },
      data: { onlineId: row.onlineId },
    });
  });
  const boundOnlineIdCount = bindRows.length;

  const questionStats = buildQuestionStats(input.parsed, resolvedRows);
  await runWithConcurrency(questionStats, 3, async (question) => {
    const questionRecord = await prisma.examQuestion.upsert({
      where: {
        sessionId_questionNo: {
          sessionId: input.sessionId,
          questionNo: question.questionNo,
        },
      },
      create: {
        sessionId: input.sessionId,
        questionNo: question.questionNo,
        correctAnswer: question.correctAnswer,
        correctRate: question.correctRate,
        difficulty: question.difficulty,
        answerDistribution: question.answerDistribution,
      },
      update: {
        correctAnswer: question.correctAnswer,
        correctRate: question.correctRate,
        difficulty: question.difficulty,
        answerDistribution: question.answerDistribution,
      },
    });

    await bulkUpsertStudentAnswers(
      prisma,
      question.answers.map((answer) => ({
        examNumber: answer.examNumber,
        questionId: questionRecord.id,
        answer: answer.answer,
        isCorrect: answer.isCorrect,
      })),
    );
  });

  const auditBefore = scoreWrites
    .map((row) => existingScoreMap.get(row.examNumber) ?? null)
    .filter((value): value is ExistingScoreSnapshot => value !== null);
  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: `SCORE_IMPORT_${input.parsed.sourceType}`,
      targetType: "ScoreImport",
      targetId: String(input.sessionId),
      before: toAuditJson(auditBefore.length > 0 ? auditBefore : null),
      after: toAuditJson({
        sessionId: input.sessionId,
        sourceType: input.parsed.sourceType,
        academyId,
        createdCount,
        updatedCount,
        unresolvedCount: preview.summary.resolveRows,
        invalidCount: preview.summary.invalidRows,
        boundOnlineIdCount,
        autoCreatedStudentCount,
        questionCount: preview.summary.questionCount,
        answerCount: preview.summary.answerCount,
        metadata: preview.metadata,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  const result = {
    preview,
    createdCount,
    updatedCount,
    unresolvedCount: preview.summary.resolveRows,
    invalidCount: preview.summary.invalidRows,
    boundOnlineIdCount,
    autoCreatedStudentCount,
    importedCount: resolvedRows.length,
  };

  if (affectedExamNumbers.length > 0) {
    recalculateScoreStatusCache(preview.session.periodId, preview.session.examType, {
      examNumbers: affectedExamNumbers,
    }).catch(console.error);
  }

  return result;
}

export type OfflineScorePreview = {
  main: ScorePreviewResult;
  ox: ScorePreviewResult | null;
};

export type OnlineScorePreview = {
  main: ScorePreviewResult;
  ox: ScorePreviewResult | null;
};

function offlineMainImport(
  offline: ParsedOfflineScoreImport,
  analysisQuestions: ParsedQuestionRecord[] = [],
  metadata: Record<string, unknown> = {},
): ParsedScoreImport {
  return {
    sourceType: offline.sourceType,
    matchingKey: offline.matchingKey,
    records: offline.records,
    questions: mergeQuestionRecords(offline.questions, analysisQuestions),
    answers: offline.answers,
    metadata: {
      ...offline.metadata,
      ...metadata,
    },
  };
}

function offlineOxImport(
  offline: ParsedOfflineScoreImport,
  metadata: Record<string, unknown> = {},
): ParsedScoreImport {
  return {
    sourceType: offline.sourceType,
    matchingKey: offline.matchingKey,
    records: offline.oxRecords,
    questions: offline.oxQuestions,
    answers: offline.oxAnswers,
    metadata: {
      ...offline.metadata,
      ...metadata,
    },
  };
}

function hasNonZeroOfflineOxScores(parsed: ParsedOfflineScoreImport) {
  return parsed.oxRecords.some((record) => (record.oxScore ?? 0) !== 0);
}

export async function previewOfflineScoreUpload(input: {
  sessionId: number;
  oxSessionId?: number;
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  analysisFileName?: string;
  analysisBuffer?: Buffer | ArrayBuffer;
  attendType?: AttendType;
}): Promise<OfflineScorePreview> {
  const parsed = parseOfflineScoreImport({
    fileName: input.mainFileName,
    buffer: input.mainBuffer,
    attendType: input.attendType,
  });
  const analysisQuestions =
    input.analysisBuffer && input.analysisFileName
      ? parseOfflineAnalysisQuestions({
          fileName: input.analysisFileName,
          buffer: input.analysisBuffer,
        })
      : [];
  const resolvedOxSessionId = await resolveOxSessionId(input.sessionId, input.oxSessionId);
  const hasNonZeroOxScores = hasNonZeroOfflineOxScores(parsed);

  if (hasNonZeroOxScores && !resolvedOxSessionId) {
    throw new Error(OX_LINK_UNAVAILABLE_MESSAGE);
  }

  const main = await buildPreview(
    input.sessionId,
    offlineMainImport(parsed, analysisQuestions, {
      mainFileName: input.mainFileName,
      analysisFileName: input.analysisFileName ?? null,
    }),
  );
  const ox =
    resolvedOxSessionId && parsed.oxRecords.length > 0
      ? await buildPreview(
          resolvedOxSessionId,
          offlineOxImport(parsed, {
            mainFileName: input.mainFileName,
            analysisFileName: input.analysisFileName ?? null,
          }),
        )
      : null;

  return { main, ox };
}

export async function executeOfflineScoreUpload(input: {
  adminId: string;
  sessionId: number;
  oxSessionId?: number;
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  analysisFileName?: string;
  analysisBuffer?: Buffer | ArrayBuffer;
  attendType?: AttendType;
  ipAddress?: string | null;
}) {
  const parsed = parseOfflineScoreImport({
    fileName: input.mainFileName,
    buffer: input.mainBuffer,
    attendType: input.attendType,
  });
  const analysisQuestions =
    input.analysisBuffer && input.analysisFileName
      ? parseOfflineAnalysisQuestions({
          fileName: input.analysisFileName,
          buffer: input.analysisBuffer,
        })
      : [];
  const resolvedOxSessionId = await resolveOxSessionId(input.sessionId, input.oxSessionId);
  const hasNonZeroOxScores = hasNonZeroOfflineOxScores(parsed);

  if (hasNonZeroOxScores && !resolvedOxSessionId) {
    throw new Error(OX_LINK_UNAVAILABLE_MESSAGE);
  }

  const [mainResult, oxResult] = await Promise.all([
    applyParsedImport({
      adminId: input.adminId,
      sessionId: input.sessionId,
      parsed: offlineMainImport(parsed, analysisQuestions, {
        mainFileName: input.mainFileName,
        analysisFileName: input.analysisFileName ?? null,
      }),
      ipAddress: input.ipAddress,
    }),
    resolvedOxSessionId && parsed.oxRecords.length > 0
      ? applyParsedImport({
          adminId: input.adminId,
          sessionId: resolvedOxSessionId,
          parsed: offlineOxImport(parsed, {
            mainFileName: input.mainFileName,
            analysisFileName: input.analysisFileName ?? null,
          }),
          ipAddress: input.ipAddress,
        })
      : Promise.resolve(null),
  ]);

  return { main: mainResult, ox: oxResult };
}

export async function previewOnlineScoreUpload(input: {
  sessionId: number;
  oxSessionId?: number;
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  oxMainFileName?: string;
  oxMainBuffer?: Buffer | ArrayBuffer;
  oxDetailFileName?: string;
  oxDetailBuffer?: Buffer | ArrayBuffer;
  resolutions?: ScoreResolutionInput;
  attendType?: AttendType;
}): Promise<OnlineScorePreview> {
  const parsed = parseOnlineScoreImport(input);
  const resolvedOxSessionId = await resolveOxSessionId(input.sessionId, input.oxSessionId);

  if (input.oxMainBuffer && input.oxMainFileName && !resolvedOxSessionId) {
    throw new Error(OX_LINK_UNAVAILABLE_MESSAGE);
  }

  const main = await buildPreview(input.sessionId, parsed, input.resolutions);
  const ox =
    resolvedOxSessionId && input.oxMainBuffer && input.oxMainFileName
      ? await buildPreview(
          resolvedOxSessionId,
          parseOnlineOxScoreImport({
            mainFileName: input.oxMainFileName,
            mainBuffer: input.oxMainBuffer,
            detailFileName: input.oxDetailFileName,
            detailBuffer: input.oxDetailBuffer,
            attendType: input.attendType,
          }),
          input.resolutions,
        )
      : null;

  return { main, ox };
}

export async function executeOnlineScoreUpload(input: {
  adminId: string;
  sessionId: number;
  oxSessionId?: number;
  mainFileName: string;
  mainBuffer: Buffer | ArrayBuffer;
  detailFileName?: string;
  detailBuffer?: Buffer | ArrayBuffer;
  oxMainFileName?: string;
  oxMainBuffer?: Buffer | ArrayBuffer;
  oxDetailFileName?: string;
  oxDetailBuffer?: Buffer | ArrayBuffer;
  resolutions?: ScoreResolutionInput;
  attendType?: AttendType;
  ipAddress?: string | null;
}) {
  const parsed = parseOnlineScoreImport(input);
  const resolvedOxSessionId = await resolveOxSessionId(input.sessionId, input.oxSessionId);

  if (input.oxMainBuffer && input.oxMainFileName && !resolvedOxSessionId) {
    throw new Error(OX_LINK_UNAVAILABLE_MESSAGE);
  }

  const [mainResult, oxResult] = await Promise.all([
    applyParsedImport({
      adminId: input.adminId,
      sessionId: input.sessionId,
      parsed,
      resolutions: input.resolutions,
      ipAddress: input.ipAddress,
    }),
    resolvedOxSessionId && input.oxMainBuffer && input.oxMainFileName
      ? applyParsedImport({
          adminId: input.adminId,
          sessionId: resolvedOxSessionId,
          parsed: parseOnlineOxScoreImport({
            mainFileName: input.oxMainFileName,
            mainBuffer: input.oxMainBuffer,
            detailFileName: input.oxDetailFileName,
            detailBuffer: input.oxDetailBuffer,
            attendType: input.attendType,
          }),
          resolutions: input.resolutions,
          ipAddress: input.ipAddress,
        })
      : Promise.resolve(null),
  ]);

  return { main: mainResult, ox: oxResult };
}

export async function previewPastedScores(input: {
  sessionId: number;
  text: string;
  attendType?: AttendType;
}) {
  const parsed = parseScorePasteImport({
    text: input.text,
    attendType: input.attendType,
  });

  return buildPreview(input.sessionId, parsed);
}

export async function executePastedScores(input: {
  adminId: string;
  sessionId: number;
  text: string;
  attendType?: AttendType;
  ipAddress?: string | null;
}) {
  const parsed = parseScorePasteImport({
    text: input.text,
    attendType: input.attendType,
  });

  return applyParsedImport({
    adminId: input.adminId,
    sessionId: input.sessionId,
    parsed,
    ipAddress: input.ipAddress,
  });
}

function buildScoreEnrollmentLabel(enrollment: {
  courseType: string;
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    (enrollment.courseType === "SPECIAL_LECTURE" ? "특강" : "종합반")
  );
}

export async function listScores(filters: ScoreFilters) {
  const academyId = await resolveVisibleScoreAcademyId();
  const search = (filters.query ?? filters.examNumber)?.trim();

  const scores = await getPrisma().score.findMany({
    where: {
      sessionId: filters.sessionId,
      ...(search
        ? {
            OR: [
              { examNumber: { contains: search } },
              { student: { name: { contains: search } } },
              { student: { phone: { contains: search } } },
            ],
          }
        : {}),
      student: {
        examType: filters.examType,
        ...(academyId === null ? {} : { academyId }),
      },
      session: {
        periodId: filters.periodId,
        week: filters.week,
        subject: filters.subject,
        examDate: filters.date,
        ...(academyId === null
          ? {}
          : {
              period: {
                academyId,
              },
            }),
      },
    },
    include: {
      student: {
        select: {
          name: true,
          examType: true,
          phone: true,
          courseEnrollments: {
            select: {
              id: true,
              status: true,
              courseType: true,
              cohort: { select: { name: true } },
              product: { select: { name: true } },
              specialLecture: { select: { name: true } },
            },
            orderBy: [{ startDate: "desc" }],
          },
        },
      },
      session: {
        include: {
          period: true,
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }, { examNumber: "asc" }],
  });

  return scores.map((score) => {
    const nextScore = withAbsenceNoteDisplay(score);

    return {
      ...nextScore,
      student: nextScore.student
        ? {
            name: nextScore.student.name,
            examType: nextScore.student.examType,
            mobile: nextScore.student.phone ?? null,
            enrollments: nextScore.student.courseEnrollments.map((enrollment) => ({
              id: enrollment.id,
              label: buildScoreEnrollmentLabel(enrollment),
              status: enrollment.status,
            })),
          }
        : null,
    };
  });
}

export function parseScoreUpdate(raw: Record<string, unknown>) {
  const rawScore =
    raw.rawScore === "" || raw.rawScore === undefined || raw.rawScore === null
      ? null
      : Number(raw.rawScore);
  const oxScore =
    raw.oxScore === "" || raw.oxScore === undefined || raw.oxScore === null
      ? null
      : Number(raw.oxScore);
  const suppliedFinalScore =
    raw.finalScore === "" || raw.finalScore === undefined || raw.finalScore === null
      ? null
      : Number(raw.finalScore);

  if (
    [rawScore, oxScore, suppliedFinalScore].some(
      (value) => value !== null && !Number.isFinite(value),
    )
  ) {
    throw new Error("점수 형식을 확인해 주세요.");
  }

  return {
    rawScore,
    oxScore,
    finalScore: computeFinalScore(rawScore, oxScore, suppliedFinalScore),
    attendType: raw.attendType as AttendType,
    note: String(raw.note ?? "").trim() || null,
  };
}

export async function updateScoreEntry(input: {
  adminId: string;
  scoreId: number;
  payload: ReturnType<typeof parseScoreUpdate>;
  ipAddress?: string | null;
}) {
  const academyId = await requireVisibleScoreWriteAcademyId();

  const score = await getPrisma().$transaction(async (tx) => {
    const before = await tx.score.findFirstOrThrow({
      where: {
        id: input.scoreId,
        session: {
          period: {
            academyId,
          },
        },
      },
      include: {
        session: {
          select: {
            periodId: true,
            examType: true,
            isLocked: true,
          },
        },
      },
    });

    assertSessionUnlocked(before.session);

    const payload = {
      ...input.payload,
      note: preserveAbsenceNoteSystemNote(before.note, input.payload.note),
    };

    const score = await tx.score.update({
      where: {
        id: input.scoreId,
      },
      data: {
        ...payload,
        academyId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SCORE_UPDATE",
        targetType: "Score",
        targetId: String(score.id),
        before: toAuditJson(before),
        after: toAuditJson(score),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      score,
      session: before.session,
      examNumber: before.examNumber,
    };
  });

  await recalculateScoreStatusCache(score.session.periodId, score.session.examType, {
    examNumbers: [score.examNumber],
  });

  return withAbsenceNoteDisplay(score.score);
}

export async function deleteSessionScores(input: {
  adminId: string;
  sessionId: number;
  ipAddress?: string | null;
}) {
  const academyId = await requireVisibleScoreWriteAcademyId();
  const prisma = getPrisma();
  const session = await prisma.examSession.findFirstOrThrow({
    where: {
      id: input.sessionId,
      period: {
        academyId,
      },
    },
    select: {
      id: true,
      periodId: true,
      examType: true,
      isLocked: true,
    },
  });

  assertSessionUnlocked(session);

  const [scores, questions] = await Promise.all([
    prisma.score.findMany({
      where: {
        sessionId: input.sessionId,
      },
      select: {
        id: true,
        examNumber: true,
      },
    }),
    prisma.examQuestion.findMany({
      where: {
        sessionId: input.sessionId,
      },
      select: {
        id: true,
      },
    }),
  ]);

  const examNumbers = scores.map((score) => score.examNumber);
  const questionIds = questions.map((question) => question.id);

  const [deletedAnswerCount, deletedBookmarkCount] = questionIds.length
    ? await Promise.all([
        prisma.studentAnswer.count({
          where: {
            questionId: {
              in: questionIds,
            },
          },
        }),
        prisma.wrongNoteBookmark.count({
          where: {
            questionId: {
              in: questionIds,
            },
          },
        }),
      ])
    : [0, 0];

  const deletedScoreCount = scores.length;
  const deletedQuestionCount = questions.length;

  await prisma.$transaction(async (tx) => {
    await tx.score.deleteMany({
      where: {
        sessionId: input.sessionId,
      },
    });

    await tx.examQuestion.deleteMany({
      where: {
        sessionId: input.sessionId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SCORE_SESSION_DELETE",
        targetType: "ExamSession",
        targetId: String(input.sessionId),
        before: toAuditJson({
          sessionId: input.sessionId,
          deletedScoreCount,
          deletedQuestionCount,
          deletedAnswerCount,
          deletedBookmarkCount,
          examNumbers,
        }),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });
  });

  if (examNumbers.length > 0) {
    recalculateScoreStatusCache(session.periodId, session.examType, {
      examNumbers,
    }).catch(console.error);
  }

  return {
    success: true,
    deletedScoreCount,
    deletedQuestionCount,
    deletedAnswerCount,
    deletedBookmarkCount,
  };
}

export async function deleteScoreEntry(input: {
  adminId: string;
  scoreId: number;
  ipAddress?: string | null;
}) {
  const academyId = await requireVisibleScoreWriteAcademyId();

  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.score.findFirstOrThrow({
      where: {
        id: input.scoreId,
        session: {
          period: {
            academyId,
          },
        },
      },
      include: {
        session: {
          select: {
            periodId: true,
            examType: true,
            isLocked: true,
          },
        },
      },
    });

    assertSessionUnlocked(before.session);

    await tx.score.delete({
      where: {
        id: input.scoreId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "SCORE_DELETE",
        targetType: "Score",
        targetId: String(input.scoreId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      success: true,
      session: before.session,
      examNumber: before.examNumber,
    };
  });

  await recalculateScoreStatusCache(result.session.periodId, result.session.examType, {
    examNumbers: [result.examNumber],
  });

  return {
    success: true,
  };
}

export async function deleteMultipleScoreEntries(input: {
  adminId: string;
  scoreIds: number[];
  ipAddress?: string | null;
}) {
  const academyId = await requireVisibleScoreWriteAcademyId();
  const uniqueScoreIds = Array.from(new Set(input.scoreIds));

  if (uniqueScoreIds.length === 0) {
    throw new Error("삭제할 성적을 선택해 주세요.");
  }

  const deletedRows = await getPrisma().$transaction(async (tx) => {
    const rows = await tx.score.findMany({
      where: {
        id: {
          in: uniqueScoreIds,
        },
        session: {
          period: {
            academyId,
          },
        },
      },
      include: {
        session: {
          select: {
            periodId: true,
            examType: true,
            isLocked: true,
          },
        },
      },
    });

    if (rows.length !== uniqueScoreIds.length) {
      throw new Error("일부 성적을 찾을 수 없습니다.");
    }

    for (const row of rows) {
      assertSessionUnlocked(row.session);
    }

    await tx.score.deleteMany({
      where: {
        id: {
          in: uniqueScoreIds,
        },
      },
    });

    await Promise.all(
      rows.map((row) =>
        tx.auditLog.create({
          data: {
            adminId: input.adminId,
            action: "SCORE_DELETE",
            targetType: "Score",
            targetId: String(row.id),
            before: toAuditJson(row),
            after: toAuditJson(null),
            ipAddress: input.ipAddress ?? null,
          },
        }),
      ),
    );

    return rows.map((row) => ({
      id: row.id,
      examNumber: row.examNumber,
      session: row.session,
    }));
  });

  const recalcGroups = new Map<string, {
    periodId: number;
    examType: ExamType;
    examNumbers: Set<string>;
  }>();

  for (const row of deletedRows) {
    const key = row.session.periodId + ":" + row.session.examType;
    const current =
      recalcGroups.get(key) ??
      {
        periodId: row.session.periodId,
        examType: row.session.examType,
        examNumbers: new Set<string>(),
      };
    current.examNumbers.add(row.examNumber);
    recalcGroups.set(key, current);
  }

  await Promise.all(
    Array.from(recalcGroups.values()).map((group) =>
      recalculateScoreStatusCache(group.periodId, group.examType, {
        examNumbers: Array.from(group.examNumbers),
      }),
    ),
  );

  return {
    success: true,
    deletedCount: deletedRows.length,
  };
}



