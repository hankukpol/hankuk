import { addDays } from "date-fns";
import { ExamType, Subject } from "@prisma/client";
import { shouldCreateDailyPoliceOxSession, toExamDateKey } from "@/lib/exam-session-rules";

type SessionSeed = {
  examType: ExamType;
  week: number;
  subject: Subject;
  examDate: Date;
};

type WeekdayTemplate = {
  offset: number;
  subject: Subject;
  examType: ExamType | "ALL";
};

const weekdayTemplates: WeekdayTemplate[] = [
  { offset: 0, subject: Subject.CONSTITUTIONAL_LAW, examType: ExamType.GONGCHAE },
  { offset: 0, subject: Subject.CRIMINOLOGY, examType: ExamType.GYEONGCHAE },
  { offset: 1, subject: Subject.CRIMINAL_PROCEDURE, examType: "ALL" },
  { offset: 2, subject: Subject.CUMULATIVE, examType: "ALL" },
  { offset: 3, subject: Subject.CRIMINAL_LAW, examType: "ALL" },
  { offset: 6, subject: Subject.POLICE_SCIENCE, examType: "ALL" },
];

function shouldCreateCriminology(examDate: Date) {
  return examDate.getMonth() + 1 >= 3;
}

function shouldSkipFinalHandoutDay(seed: SessionSeed, totalWeeks: number, latestDateKey: string | null) {
  if (totalWeeks < 8 || !latestDateKey) {
    return false;
  }

  return seed.subject === Subject.POLICE_SCIENCE && toExamDateKey(seed.examDate) === latestDateKey;
}

export function buildPeriodSessions(input: {
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
  enabledExamTypes?: ExamType[];
}) {
  const mainSessions: SessionSeed[] = [];
  const enabledExamTypes = new Set(input.enabledExamTypes ?? [ExamType.GONGCHAE, ExamType.GYEONGCHAE]);

  for (let week = 1; week <= input.totalWeeks; week += 1) {
    const weekStart = addDays(input.startDate, (week - 1) * 7);

    for (const template of weekdayTemplates) {
      const examDate = addDays(weekStart, template.offset);

      if (examDate > input.endDate) {
        continue;
      }

      if (template.subject === Subject.CRIMINOLOGY && !shouldCreateCriminology(examDate)) {
        continue;
      }

      if (template.examType === "ALL") {
        if (enabledExamTypes.has(ExamType.GONGCHAE)) {
          mainSessions.push({ examType: ExamType.GONGCHAE, week, subject: template.subject, examDate });
        }
        if (enabledExamTypes.has(ExamType.GYEONGCHAE)) {
          mainSessions.push({ examType: ExamType.GYEONGCHAE, week, subject: template.subject, examDate });
        }
        continue;
      }

      if (!enabledExamTypes.has(template.examType)) {
        continue;
      }

      mainSessions.push({ examType: template.examType, week, subject: template.subject, examDate });
    }
  }

  const latestDateKey =
    mainSessions.length > 0
      ? toExamDateKey(
          [...mainSessions].sort((left, right) => right.examDate.getTime() - left.examDate.getTime())[0].examDate,
        )
      : null;

  const filteredMainSessions = mainSessions.filter(
    (seed) => !shouldSkipFinalHandoutDay(seed, input.totalWeeks, latestDateKey),
  );

  const firstPoliceScienceSession =
    [...filteredMainSessions]
      .filter((seed) => seed.subject === Subject.POLICE_SCIENCE)
      .sort((left, right) => left.examDate.getTime() - right.examDate.getTime())[0] ?? null;
  const oxStartDate = firstPoliceScienceSession?.examDate ?? null;

  const policeOxSessions = filteredMainSessions
    .filter((seed) => shouldCreateDailyPoliceOxSession(seed.subject, seed.examDate, oxStartDate))
    .map((seed) => ({
      examType: seed.examType,
      week: seed.week,
      subject: Subject.POLICE_SCIENCE,
      examDate: seed.examDate,
    } satisfies SessionSeed));

  const deduped = new Map<string, SessionSeed>();
  for (const seed of [...filteredMainSessions, ...policeOxSessions]) {
    deduped.set(
      `${seed.examType}:${seed.week}:${seed.subject}:${seed.examDate.toISOString()}`,
      seed,
    );
  }

  return Array.from(deduped.values()).sort(
    (left, right) => left.examDate.getTime() - right.examDate.getTime(),
  );
}
