import { ExamType, Subject } from "@prisma/client";

type SessionLike = {
  examType: ExamType;
  subject: Subject;
  displaySubjectName?: string | null;
  examDate: Date | string;
  periodId?: number;
  id?: number;
};

export type SessionDisplayColumn<T extends SessionLike> = {
  key: string;
  examDate: Date;
  subject: Subject;
  displaySubjectName: string | null;
  mainSession: T | null;
  oxSession: T | null;
  sessions: T[];
};

function reviveDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function sessionScopeKey(session: SessionLike) {
  return `${session.periodId ?? "period"}:${session.examType}`;
}

function sessionOrderValue(session: SessionLike) {
  return typeof session.id === "number" ? session.id : 0;
}

export function toExamDateKey(value: Date | string) {
  const date = reviveDate(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function isPoliceOxOnlySession<T extends SessionLike>(session: T, sessions: T[]) {
  if (session.subject !== Subject.POLICE_SCIENCE) {
    return false;
  }

  const dateKey = toExamDateKey(session.examDate);
  const scopeKey = sessionScopeKey(session);

  return sessions.some(
    (candidate) =>
      candidate !== session &&
      sessionScopeKey(candidate) === scopeKey &&
      toExamDateKey(candidate.examDate) === dateKey &&
      candidate.subject !== Subject.POLICE_SCIENCE,
  );
}

export function getMockRankingSessions<T extends SessionLike>(sessions: T[]) {
  return sessions.filter((session) => !isPoliceOxOnlySession(session, sessions));
}

export function getPoliceOxSessions<T extends SessionLike>(sessions: T[]) {
  return sessions.filter((session) => session.subject === Subject.POLICE_SCIENCE);
}

export function buildSessionDisplayColumns<T extends SessionLike>(sessions: T[]): SessionDisplayColumn<T>[] {
  const grouped = new Map<string, T[]>();

  for (const session of sessions) {
    const key = `${sessionScopeKey(session)}:${toExamDateKey(session.examDate)}`;
    const current = grouped.get(key) ?? [];
    current.push(session);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([key, groupedSessions]) => {
      const ordered = [...groupedSessions].sort(
        (left, right) =>
          reviveDate(left.examDate).getTime() - reviveDate(right.examDate).getTime() ||
          sessionOrderValue(left) - sessionOrderValue(right),
      );
      const oxSession =
        ordered.find((session) => session.subject === Subject.POLICE_SCIENCE) ?? null;
      const mainSession =
        ordered.find((session) => session.subject !== Subject.POLICE_SCIENCE) ?? oxSession;

      return {
        key,
        examDate: reviveDate(ordered[0]?.examDate ?? new Date()),
        subject: mainSession?.subject ?? ordered[0]?.subject ?? Subject.POLICE_SCIENCE,
        displaySubjectName: mainSession?.displaySubjectName ?? ordered[0]?.displaySubjectName ?? null,
        mainSession,
        oxSession,
        sessions: ordered,
      } satisfies SessionDisplayColumn<T>;
    })
    .sort(
      (left, right) =>
        left.examDate.getTime() - right.examDate.getTime() ||
        sessionOrderValue(left.mainSession ?? left.oxSession ?? left.sessions[0]) -
          sessionOrderValue(right.mainSession ?? right.oxSession ?? right.sessions[0]),
    );
}

export function shouldCreateDailyPoliceOxSession(subject: Subject, examDate: Date, oxStartDate: Date | null) {
  if (!oxStartDate) {
    return false;
  }

  if (subject === Subject.POLICE_SCIENCE || subject === Subject.CUMULATIVE) {
    return false;
  }

  return reviveDate(examDate).getTime() >= oxStartDate.getTime();
}
