import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { applyScoreSessionAcademyScope } from "@/lib/scores/session-admin";
import { getScoreSubjectLabel } from "@/lib/scores/subject-filter";

type ScoreCorrectionMemoLike = {
  id: number | string;
  title: string;
  content: string | null;
  relatedStudentExamNumber: string | null;
  relatedExamSessionId?: number | null;
};

type ParsedCorrectionMemo = {
  examNumber: string | null;
  examDate: string | null;
  subjectLabel: string | null;
};

export type ScoreCorrectionTarget = ParsedCorrectionMemo & {
  href: string;
  sessionId: number | null;
};

const CONTENT_PATTERN = /\[성적 오류 신고\]\s*시험일:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}),\s*과목:\s*([^,]+),/;
const TITLE_PATTERN = /—\s*(.+)\s+([0-9]{4}-[0-9]{2}-[0-9]{2})$/;

function normalizeValue(value: string | null | undefined) {
  return value?.replace(/\s+/g, "").trim() ?? "";
}

function parseCorrectionMemo(memo: ScoreCorrectionMemoLike): ParsedCorrectionMemo {
  const examNumber = memo.relatedStudentExamNumber?.trim() || null;
  const contentMatch = memo.content?.match(CONTENT_PATTERN);
  if (contentMatch) {
    return {
      examNumber,
      examDate: contentMatch[1],
      subjectLabel: contentMatch[2]?.trim() || null,
    };
  }

  const titleMatch = memo.title.match(TITLE_PATTERN);
  if (titleMatch) {
    return {
      examNumber,
      examDate: titleMatch[2],
      subjectLabel: titleMatch[1]?.trim() || null,
    };
  }

  return {
    examNumber,
    examDate: null,
    subjectLabel: null,
  };
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildScoreEditHref(input: {
  examNumber?: string | null;
  sessionId?: number | null;
}) {
  const params = new URLSearchParams();

  if (input.sessionId) {
    params.set("sessionId", String(input.sessionId));
  }

  if (input.examNumber) {
    params.set("examNumber", input.examNumber);
  }

  const query = params.toString();
  return query ? `/admin/scores/edit?${query}` : "/admin/scores/edit";
}

export async function resolveScoreCorrectionTargets(input: {
  memos: ScoreCorrectionMemoLike[];
  academyId: number | null;
}) {
  const prisma = getPrisma();
  const parsedMemos = input.memos.map((memo) => ({
    memo,
    parsed: parseCorrectionMemo(memo),
  }));

  const examNumbers = Array.from(
    new Set(
      parsedMemos
        .map((item) => item.parsed.examNumber)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const directSessionIds = Array.from(
    new Set(
      parsedMemos
        .map((item) => item.memo.relatedExamSessionId)
        .filter((value): value is number => typeof value === "number"),
    ),
  );
  const subjectLabelMap = buildExamSubjectLabelMap(
    input.academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(input.academyId, { includeInactive: true }),
  );

  const [scoreRows, directSessions] = await Promise.all([
    examNumbers.length
      ? prisma.score.findMany({
          where: {
            examNumber: { in: examNumbers },
            ...(input.academyId === null
              ? {}
              : {
                  student: { academyId: input.academyId },
                  session: { period: { academyId: input.academyId } },
                }),
          },
          select: {
            examNumber: true,
            sessionId: true,
            session: {
              select: {
                examDate: true,
                subject: true,
                displaySubjectName: true,
              },
            },
          },
          orderBy: [{ session: { examDate: "desc" } }, { sessionId: "desc" }],
        })
      : Promise.resolve([]),
    directSessionIds.length
      ? prisma.examSession.findMany({
          where: applyScoreSessionAcademyScope(
            {
              id: { in: directSessionIds },
            },
            input.academyId,
          ),
          select: {
            id: true,
            examDate: true,
            subject: true,
            displaySubjectName: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const scoresByExamNumber = new Map<string, typeof scoreRows>();
  for (const row of scoreRows) {
    const current = scoresByExamNumber.get(row.examNumber) ?? [];
    current.push(row);
    scoresByExamNumber.set(row.examNumber, current);
  }

  const directSessionMap = new Map<number, (typeof directSessions)[number]>(
    directSessions.map((session) => [session.id, session]),
  );

  const result = new Map<ScoreCorrectionMemoLike["id"], ScoreCorrectionTarget>();

  for (const item of parsedMemos) {
    const { examNumber, examDate, subjectLabel } = item.parsed;
    const directSession =
      typeof item.memo.relatedExamSessionId === "number"
        ? directSessionMap.get(item.memo.relatedExamSessionId) ?? null
        : null;
    const candidates = examNumber ? scoresByExamNumber.get(examNumber) ?? [] : [];
    const sameDate = examDate
      ? candidates.filter((row) => toDateKey(row.session.examDate) === examDate)
      : [];
    const matchedBySubject = subjectLabel
      ? sameDate.filter(
          (row) =>
            normalizeValue(
              getScoreSubjectLabel(row.session.subject, row.session.displaySubjectName, subjectLabelMap),
            ) === normalizeValue(subjectLabel),
        )
      : [];

    const matchedSessionId =
      directSession?.id ??
      matchedBySubject[0]?.sessionId ??
      (matchedBySubject.length === 0 && sameDate.length === 1 ? sameDate[0].sessionId : null);

    result.set(item.memo.id, {
      examNumber,
      examDate: directSession ? toDateKey(directSession.examDate) : examDate,
      subjectLabel: directSession
        ? getScoreSubjectLabel(directSession.subject, directSession.displaySubjectName, subjectLabelMap)
        : subjectLabel,
      sessionId: matchedSessionId,
      href: buildScoreEditHref({
        examNumber,
        sessionId: matchedSessionId,
      }),
    });
  }

  return result;
}

export async function resolveScoreCorrectionTarget(input: {
  memo: ScoreCorrectionMemoLike;
  academyId: number | null;
}) {
  return (
    (await resolveScoreCorrectionTargets({
      memos: [input.memo],
      academyId: input.academyId,
    })).get(input.memo.id) ?? {
      examNumber: input.memo.relatedStudentExamNumber?.trim() || null,
      examDate: null,
      subjectLabel: null,
      sessionId: null,
      href: buildScoreEditHref({ examNumber: input.memo.relatedStudentExamNumber }),
    }
  );
}