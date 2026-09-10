/**
 * 주차를 사람이 부르는 이름으로 옮긴다.
 *
 * 저장은 ISO 주차(2026년 36주차)로 한다 — 한 해 안에서 겹치지 않고 정렬이 되는 값이라
 * 키로 쓰기에 맞다. 다만 학원에서 그 번호를 입에 올리는 사람은 없다. "36주차"를 듣고
 * 언제인지 아는 사람이 없으니 화면에는 "8월 5주차"로 적는다.
 *
 * 어느 달에 속하는지는 그 주의 **월요일**이 정한다. 8월 31일에 시작해 9월 4일에 끝나는
 * 주는 8월이다. 시험 주가 월~금이라 월요일이 그 주의 시작이고, 주간 성적표를 받아 드는
 * 시점에서 "지난주"는 월요일부터 세는 주다. 몇째 주인지는 그 달에 같은 요일이 몇 번째로
 * 오는지로 센다 — 8월 3일이면 첫째, 8월 31일이면 다섯째다.
 */

/** ISO 주차의 월요일. 그 해 1월 4일은 언제나 1주차에 든다는 성질을 쓴다. */
export function isoWeekMonday(weekYear: number, weekNumber: number) {
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
  const monday = new Date(firstMonday);
  monday.setUTCDate(firstMonday.getUTCDate() + (weekNumber - 1) * 7);
  return monday;
}

function parts(year: number, month: number, day: number) {
  return { year, month, week: Math.floor((day - 1) / 7) + 1 };
}

/** "YYYY-MM-DD" 로 시작하는 주. 날짜를 이미 알고 있으면 ISO 되돌리기를 하지 않는다. */
export function weekPartsFromStartDate(startDate: string) {
  const [year, month, day] = startDate.slice(0, 10).split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? parts(year, month, day)
    : null;
}

export function weekPartsFromIso(weekYear: number, weekNumber: number) {
  const monday = isoWeekMonday(weekYear, weekNumber);
  return parts(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

/** "2026년 8월 5주차". 주의 시작일을 알면 그것이 우선이다. */
export function formatWeekLabel(
  week: { weekYear: number; weekNumber: number; startDate?: string | null },
) {
  const resolved =
    (week.startDate ? weekPartsFromStartDate(week.startDate) : null) ??
    weekPartsFromIso(week.weekYear, week.weekNumber);
  return `${resolved.year}년 ${resolved.month}월 ${resolved.week}주차`;
}

/** 차트 축처럼 자리가 없는 곳에 쓰는 짧은 이름 — "8월 5주". */
export function formatShortWeekLabel(
  week: { weekYear: number; weekNumber: number; startDate?: string | null },
) {
  const resolved =
    (week.startDate ? weekPartsFromStartDate(week.startDate) : null) ??
    weekPartsFromIso(week.weekYear, week.weekNumber);
  return `${resolved.month}월 ${resolved.week}주`;
}
