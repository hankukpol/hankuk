import {
  AttendType,
  EnrollmentStatus,
  ExamDivision,
  ExamEventType,
  Subject,
} from "@prisma/client";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { getStudentHistory } from "@/lib/students/service";

export const STUDENT_SCORE_EXAM_TYPE_LABEL: Record<ExamEventType, string> = {
  MORNING: "아침모의고사",
  MONTHLY: "월말평가",
  SPECIAL: "특강모의고사",
  EXTERNAL: "외부모의고사",
};

export const STUDENT_SCORE_ATTEND_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "라이브",
  EXCUSED: "사유 결시",
  ABSENT: "무단 결시",
};

export const STUDENT_SCORE_DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "등록 대기",
  ACTIVE: "수강 중",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  WAITING: "대기",
  CANCELLED: "취소",
};

type StudentHistory = NonNullable<Awaited<ReturnType<typeof getStudentHistory>>>;
type StudentHistoryScore = StudentHistory["scores"][number];

export type StudentIntegratedEnrollment = {
  id: string;
  label: string;
  status: EnrollmentStatus;
  statusLabel: string;
};

export type StudentIntegratedScoreHeader = {
  examNumber: string;
  name: string;
  mobile: string | null;
  examType: StudentHistory["examType"];
  className: string | null;
  generation: number | null;
  isActive: boolean;
  academyId: number | null;
  currentEnrollments: StudentIntegratedEnrollment[];
};

export type StudentIntegratedScoreRow = {
  id: string;
  sourceKind: "MORNING" | "EVENT";
  examType: ExamEventType;
  examTypeLabel: string;
  examDate: Date;
  title: string;
  subject: Subject | null;
  subjectLabel: string;
  score: number | null;
  rank: number | null;
  participantCount: number | null;
  metricLabel: string | null;
  note: string | null;
  detailHref: string;
  periodName: string | null;
  week: number | null;
  sessionId: number | null;
  legacyScoreId: number | null;
  registrationId: string | null;
  isVirtual: boolean;
};

export type StudentIntegratedScoreHistory = {
  student: StudentIntegratedScoreHeader;
  rows: StudentIntegratedScoreRow[];
  morningRows: StudentIntegratedScoreRow[];
  eventRows: StudentIntegratedScoreRow[];
  subjectOptions: Array<{ value: Subject; label: string }>;
};

function resolveMorningScoreValue(score: StudentHistoryScore) {
  if (score.finalScore !== null) {
    return score.finalScore;
  }

  if (score.oxScore !== null) {
    return score.oxScore;
  }

  return score.rawScore;
}

function buildRankLookup(rows: Array<{ examNumber: string; score: number }>) {
  const sorted = [...rows].sort(
    (left, right) => right.score - left.score || left.examNumber.localeCompare(right.examNumber),
  );
  const rankByExamNumber = new Map<string, number>();
  let currentRank = 0;
  let previousScore: number | null = null;

  sorted.forEach((row, index) => {
    if (previousScore === null || row.score !== previousScore) {
      currentRank = index + 1;
      previousScore = row.score;
    }

    if (!rankByExamNumber.has(row.examNumber)) {
      rankByExamNumber.set(row.examNumber, currentRank);
    }
  });

  return {
    participantCount: sorted.length,
    rankByExamNumber,
  };
}

function buildEnrollmentLabel(enrollment: {
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
  courseType: string;
}) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    enrollment.courseType
  );
}

function resolveEventDetailHref(eventType: ExamEventType, eventId: string) {
  switch (eventType) {
    case ExamEventType.MONTHLY:
      return `/admin/exams/monthly/${eventId}/scores`;
    case ExamEventType.SPECIAL:
      return `/admin/exams/special/${eventId}/scores`;
    case ExamEventType.EXTERNAL:
      return `/admin/exams/external/${eventId}/scores`;
    case ExamEventType.MORNING:
    default:
      return `/admin/exams/morning/scores`;
  }
}

export async function getStudentIntegratedScoreHistory(
  examNumber: string,
): Promise<StudentIntegratedScoreHistory | null> {
  const prisma = getPrisma();
  const history = await getStudentHistory(examNumber);

  if (!history) {
    return null;
  }

  const subjectCatalog = history.academyId
    ? await listExamSubjectCatalogForAcademy(history.academyId)
    : buildFallbackExamSubjectCatalog();
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const currentEnrollmentsRaw = await prisma.courseEnrollment.findMany({
    where: {
      examNumber: history.examNumber,
      ...(history.academyId !== null ? { academyId: history.academyId } : {}),
      status: {
        in: [
          EnrollmentStatus.ACTIVE,
          EnrollmentStatus.SUSPENDED,
          EnrollmentStatus.WAITING,
        ],
      },
    },
    include: {
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 6,
  });

  const currentEnrollments: StudentIntegratedEnrollment[] = currentEnrollmentsRaw.map(
    (enrollment) => ({
      id: enrollment.id,
      label: buildEnrollmentLabel(enrollment),
      status: enrollment.status,
      statusLabel: ENROLLMENT_STATUS_LABEL[enrollment.status],
    }),
  );

  const morningSessionIds = Array.from(
    new Set(history.scores.filter((score) => score.id > 0).map((score) => score.sessionId)),
  );

  const morningRankRows = morningSessionIds.length
    ? await prisma.score.findMany({
        where: {
          sessionId: { in: morningSessionIds },
          ...(history.academyId !== null ? { academyId: history.academyId } : {}),
          attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          finalScore: { not: null },
        },
        select: {
          sessionId: true,
          examNumber: true,
          finalScore: true,
        },
      })
    : [];

  const morningRankLookup = new Map<
    number,
    { participantCount: number; rankByExamNumber: Map<string, number> }
  >();

  for (const sessionId of morningSessionIds) {
    const rows = morningRankRows
      .filter((row) => row.sessionId === sessionId && row.finalScore !== null)
      .map((row) => ({
        examNumber: row.examNumber,
        score: row.finalScore as number,
      }));

    morningRankLookup.set(sessionId, buildRankLookup(rows));
  }

  const morningRows: StudentIntegratedScoreRow[] = history.scores.map((score) => {
    const rankInfo = morningRankLookup.get(score.sessionId);
    const subjectLabel =
      score.session.displaySubjectName?.trim() ||
      subjectLabelMap[score.session.subject] ||
      score.session.subject;

    return {
      id: `score:${score.id}`,
      sourceKind: "MORNING",
      examType: ExamEventType.MORNING,
      examTypeLabel: STUDENT_SCORE_EXAM_TYPE_LABEL[ExamEventType.MORNING],
      examDate: score.session.examDate,
      title: `${score.session.period.name} ${score.session.week}\uC8FC\uCC28`,
      subject: score.session.subject,
      subjectLabel,
      score: resolveMorningScoreValue(score),
      rank:
        score.id > 0
          ? rankInfo?.rankByExamNumber.get(history.examNumber) ?? null
          : null,
      participantCount: rankInfo?.participantCount ?? null,
      metricLabel: STUDENT_SCORE_ATTEND_LABEL[score.attendType] ?? score.attendType,
      note: score.note ?? null,
      detailHref: `/admin/scores/edit?examNumber=${history.examNumber}&sessionId=${score.sessionId}`,
      periodName: score.session.period.name,
      week: score.session.week,
      sessionId: score.sessionId,
      legacyScoreId: score.id > 0 ? score.id : null,
      registrationId: null,
      isVirtual: Boolean(score.isVirtual),
    };
  });

  const eventRegistrations = await prisma.examRegistration.findMany({
    where: {
      examNumber: history.examNumber,
      cancelledAt: null,
      ...(history.academyId !== null
        ? { student: { is: { academyId: history.academyId } } }
        : {}),
    },
    include: {
      examEvent: {
        select: {
          id: true,
          title: true,
          eventType: true,
          examDate: true,
        },
      },
      score: {
        select: {
          score: true,
          rank: true,
          note: true,
        },
      },
    },
    orderBy: [{ examEvent: { examDate: "desc" } }, { registeredAt: "desc" }],
  });

  const eventIds = Array.from(new Set(eventRegistrations.map((row) => row.examEventId)));
  const eventParticipantRows = eventIds.length
    ? await prisma.examRegistration.findMany({
        where: {
          examEventId: { in: eventIds },
          cancelledAt: null,
        },
        select: {
          examEventId: true,
          score: {
            select: { id: true },
          },
        },
      })
    : [];

  const eventParticipantCountMap = new Map<string, number>();
  for (const row of eventParticipantRows) {
    if (!row.score) {
      continue;
    }
    eventParticipantCountMap.set(
      row.examEventId,
      (eventParticipantCountMap.get(row.examEventId) ?? 0) + 1,
    );
  }

  const eventRows: StudentIntegratedScoreRow[] = eventRegistrations.map((registration) => ({
    id: `registration:${registration.id}`,
    sourceKind: "EVENT",
    examType: registration.examEvent.eventType,
    examTypeLabel: STUDENT_SCORE_EXAM_TYPE_LABEL[registration.examEvent.eventType],
    examDate: registration.examEvent.examDate,
    title: registration.examEvent.title,
    subject: null,
    subjectLabel: "\uC804\uACFC\uBAA9",
    score: registration.score?.score ?? null,
    rank: registration.score?.rank ?? null,
    participantCount: eventParticipantCountMap.get(registration.examEventId) ?? null,
    metricLabel: STUDENT_SCORE_DIVISION_LABEL[registration.division] ?? registration.division,
    note: registration.score?.note ?? null,
    detailHref: resolveEventDetailHref(
      registration.examEvent.eventType,
      registration.examEvent.id,
    ),
    periodName: null,
    week: null,
    sessionId: null,
    legacyScoreId: null,
    registrationId: registration.id,
    isVirtual: false,
  }));

  const rows = [...morningRows, ...eventRows].sort(
    (left, right) =>
      right.examDate.getTime() - left.examDate.getTime() || right.id.localeCompare(left.id),
  );

  const subjectOptions = subjectCatalog[history.examType]
    .filter((subject) => morningRows.some((row) => row.subject === subject.code))
    .map((subject) => ({
      value: subject.code,
      label: subject.displayName,
    }));

  return {
    student: {
      examNumber: history.examNumber,
      name: history.name,
      mobile: history.phone ?? null,
      examType: history.examType,
      className: history.className,
      generation: history.generation,
      isActive: history.isActive,
      academyId: history.academyId,
      currentEnrollments,
    },
    rows,
    morningRows,
    eventRows,
    subjectOptions,
  };
}
