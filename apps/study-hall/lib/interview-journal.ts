/**
 * 학생별 면담 일지 — 화면·인쇄가 함께 쓰는 순수 함수.
 * DB 칸(content·result)은 그대로 두고, 상담자가 적은 글의 형식만 읽어 나눠 보여 준다.
 * - 면담 내용: `[학습 현황]`처럼 대괄호로 시작하는 줄을 소제목으로 본다.
 * - 약속·후속 조치: 한 줄이 약속 하나다. 앞의 `·`, `-`, `1.` 같은 표시는 떼어 낸다.
 */

export type JournalLine = { bullet: boolean; text: string };
export type JournalSection = { title: string | null; lines: JournalLine[] };

const HEADING = /^\s*\[([^[\]]{1,20})\]\s*(.*)$/;
const BULLET = /^\s*(?:[·•ㆍ▪◦]\s*|[-*]\s+|\d{1,2}[.)]\s+)/;

function toLine(raw: string): JournalLine | null {
  const text = raw.replace(BULLET, "").trim();
  if (!text) return null;
  return { bullet: BULLET.test(raw), text };
}

/** 면담 내용을 소제목 묶음으로 나눈다. 소제목 앞의 글은 제목 없는 묶음이 된다. */
export function parseInterviewContent(content: string | null | undefined): JournalSection[] {
  if (!content?.trim()) return [];
  const sections: JournalSection[] = [];
  let current: JournalSection = { title: null, lines: [] };
  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = raw.match(HEADING);
    if (heading) {
      if (current.title !== null || current.lines.length) sections.push(current);
      current = { title: heading[1].trim(), lines: [] };
      const rest = heading[2] ? toLine(heading[2]) : null;
      if (rest) current.lines.push(rest);
      continue;
    }
    const line = toLine(raw);
    if (line) current.lines.push(line);
  }
  if (current.title !== null || current.lines.length) sections.push(current);
  return sections;
}

/** 약속·후속 조치 칸을 약속 목록으로. 빈 줄은 버린다. */
export function parsePromises(result: string | null | undefined): string[] {
  if (!result?.trim()) return [];
  return result
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((raw) => toLine(raw)?.text ?? "")
    .filter(Boolean);
}

/** 새 면담 내용의 기본 틀. 소제목은 자유롭게 바꿔 써도 같은 방식으로 나뉜다. */
export const INTERVIEW_CONTENT_HEADINGS = ["학습 현황", "성적", "생활", "지도"] as const;

export function buildContentTemplate(headings: readonly string[] = INTERVIEW_CONTENT_HEADINGS) {
  return headings.map((title) => `[${title}]\n· `).join("\n\n");
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 2026-10-06 → 10/6(화) */
export function journalDayLabel(date: string) {
  const ymd = date.slice(0, 10);
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()]})`;
}

type JournalInterview = {
  studentId: string;
  date: string;
  createdAt: string;
  status: string;
  followUpDate: string | null;
};

export type StudentJournalSummary = {
  count: number;
  lastDate: string | null;
  openCount: number;
  /** 후속 확인일이 오늘까지 왔는데 아직 확인 완료가 아닌 면담이 있다. */
  overdue: boolean;
};

/** 학생별 면담 횟수·마지막 면담일·후속 확인 상태. */
export function summarizeByStudent(interviews: JournalInterview[], today: string) {
  const map = new Map<string, StudentJournalSummary>();
  for (const interview of interviews) {
    const row = map.get(interview.studentId) ?? { count: 0, lastDate: null, openCount: 0, overdue: false };
    row.count += 1;
    const date = interview.date.slice(0, 10);
    if (!row.lastDate || date > row.lastDate) row.lastDate = date;
    if (interview.status === "OPEN") {
      row.openCount += 1;
      if (interview.followUpDate && interview.followUpDate.slice(0, 10) <= today) row.overdue = true;
    }
    map.set(interview.studentId, row);
  }
  return map;
}

/** 한 학생의 면담을 최신순으로. 같은 날이면 나중에 기록한 것이 위. */
export function sortJournal<T extends JournalInterview>(interviews: T[]) {
  return [...interviews].sort(
    (left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt),
  );
}

type PromiseSource = {
  result: string | null;
  /** 학습 면담의 할 일(2026-10-07). 있으면 글자 약속 대신 이것을 약속으로 본다. */
  tasks?: Array<{ subjectName: string; title: string; status: string }>;
};

const TASK_STATUS_SUFFIX: Record<string, string> = { DONE: "했음", PARTIAL: "일부 했음", NOT_DONE: "못 했음", CANCELLED: "취소" };

/**
 * 면담 하나의 약속 목록. 학습 면담의 할 일이 있으면 할 일을(확인한 결과를 뒤에 붙여), 없으면 약속·후속 칸의 줄을 쓴다.
 * 예전 기록(글자 약속)은 그대로 읽힌다.
 */
export function journalPromises(interview: PromiseSource): string[] {
  const tasks = (interview.tasks ?? []).filter((task) => task.status !== "CANCELLED");
  if (tasks.length) {
    return tasks.map((task) => {
      const suffix = TASK_STATUS_SUFFIX[task.status];
      const title = task.title.includes(task.subjectName) ? task.title : `${task.subjectName} · ${task.title}`;
      return suffix ? `${title} (${suffix})` : title;
    });
  }
  return parsePromises(interview.result);
}

/**
 * 맨 위 "지켜야 할 약속"에 올릴 면담: 약속(또는 학습 면담 할 일)이 있는 가장 최근 면담.
 * 다음 면담에서 이 약속부터 확인한다.
 */
export function latestPromiseInterview<T extends JournalInterview & PromiseSource>(sorted: T[]) {
  return sorted.find((interview) => journalPromises(interview).length > 0) ?? null;
}
