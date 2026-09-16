import type { LearningPayload } from "./learning-report";
import { policyAt } from "./learning-types";
import { average } from "./metrics";

// Reuse the formatter: constructing ICU formatters inside question/review loops
// blocks the report's first render when several months of answers are loaded.
const seoulFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
});
export const seoulDay = (at: string) => seoulFormatter.format(new Date(at));
export function latestReview(
  payload: LearningPayload,
  itemId: string,
  to: string,
) {
  return payload.document.reviews
    .filter((r) => r.itemId === itemId && seoulDay(r.at) <= to)
    .reverse()
    .sort((a, b) => b.at.localeCompare(a.at));
}
export function topicAnalytics(
  payload: LearningPayload,
  examTypeId: string,
  subjectId: string,
  from: string,
  to: string,
  cumulative: boolean,
) {
  const reviewDate = seoulDay(new Date().toISOString());
  const reviewHistory = new Map<string, ReturnType<typeof latestReview>>();
  const historyFor = (itemId: string, day: string) => {
    const key = `${itemId}:${day}`;
    let history = reviewHistory.get(key);
    if (!history) {
      history = latestReview(payload, itemId, day);
      reviewHistory.set(key, history);
    }
    return history;
  };
  const doc = payload.document,
    group = doc.subjects.find((s) => s.subjectIds.includes(subjectId)),
    policy = policyAt(doc, to);
  return doc.topics
    .filter((t) => t.subjectGroupId === group?.id && t.parentId !== null)
    .map((topic) => {
      const items = payload.items.filter(
        (i) =>
          i.examTypeId === examTypeId &&
          i.subjectId === subjectId &&
          doc.assignments[i.id] === topic.id &&
          i.date <= to &&
          (cumulative || i.date >= from),
      );
      const recorded = items.filter((i) => i.correct !== null),
        paired = recorded.filter(
          (i) =>
            i.externalRate !== null &&
            i.externalRate >= 0 &&
            i.externalRate <= 100,
        );
      const my = average(paired.map((i) => (i.correct ? 100 : 0))),
        external = average(paired.map((i) => i.externalRate));
      const gap = my === null || external === null ? null : my - external;
      const wrong = recorded.filter((i) => i.correct === false),
        blank = wrong.filter((i) => !i.answer?.trim());
      const sessions = Array.from(new Set(recorded.map((i) => i.sessionId)));
      const pairedSessions = new Set(paired.map((i) => i.sessionId)).size;
      const repeatedSessions = new Set(wrong.map((i) => i.sessionId)).size;
      const attempts = wrong
        .map((i) =>
          historyFor(i.id, reviewDate).find((r) => r.action === "attempt"),
        )
        .filter((r) => r !== undefined);
      const solved = attempts.filter((r) => r.correct === true),
        again = attempts.filter((r) => r.correct === false);
      const planned = wrong.filter((i) => {
        const history = historyFor(i.id, reviewDate);
        return history[0]?.action === "plan";
      });
      const dates = Array.from(new Set(recorded.map((i) => i.date))).sort();
      const recent = dates.slice(-2).map((date) => {
        const qs = recorded.filter((i) => i.date === date);
        return {
          date,
          count: qs.length,
          rate: (qs.filter((i) => i.correct).length / qs.length) * 100,
        };
      });
      const repeated = Boolean(
        policy && repeatedSessions >= policy.repeatWrongSessions,
      );
      const plannedTopics = doc.plans.filter(
        (p) =>
          p.topicId === topic.id &&
          p.examTypeId === examTypeId &&
          p.date <= to &&
          (cumulative || p.date >= from),
      );
      const now = reviewDate;
      const coverage = payload.topicSessions.filter(
        (s) =>
          s.topicId === topic.id &&
          s.examTypeId === examTypeId &&
          s.subjectId === subjectId &&
          s.date <= to &&
          (cumulative || s.date >= from),
      );
      const hasPastExam =
        coverage.some((s) => s.date <= now) ||
        plannedTopics.some((p) => p.date <= now);
      let status: string;
      if (!recorded.length)
        status = hasPastExam
          ? "미응시 / 채점 자료 없음"
          : plannedTopics.some((p) => p.date > now) ||
              coverage.some((s) => s.date > now)
            ? "학습 예정"
            : items.length
              ? "미응시 / 채점 자료 없음"
              : "시험 기록 없음";
      else if (!policy) status = "분석 기준 미설정";
      else if (
        paired.length < policy.minItems ||
        pairedSessions < policy.minSessions
      )
        status = "자료 부족";
      else if (gap !== null && gap <= -policy.weakGap) status = "우선 복습";
      else if (my !== null && my < policy.lowCorrectRate)
        status =
          gap !== null && gap >= 0
            ? "어려운 범위 · 추가 점검"
            : "기초 개념 점검";
      else status = repeated ? "반복 오답 점검" : "유지 · 다음 진도";
      const originalMorning = payload.items.filter(
        (i) =>
          i.kind === "MORNING" &&
          i.correct === false &&
          doc.assignments[i.id] === topic.id,
      );
      const transfer = payload.items.filter(
        (i) =>
          i.kind === "REGULAR" &&
          i.correct !== null &&
          i.date <= to &&
          doc.assignments[i.id] === topic.id &&
          originalMorning.some(
            (m) =>
              historyFor(m.id, i.date).filter(
                (r) => r.action === "attempt" && seoulDay(r.at) < i.date,
              )[0]?.correct === true,
          ),
      );
      const action = !recorded.length
        ? "시험 일정과 응시 기록 확인"
        : !policy || status === "자료 부족"
          ? "추가 문항을 풀고 다시 점검"
          : status === "우선 복습"
            ? "개념 확인 후 아래 오답 재풀이"
            : repeated
              ? "반복 오답 진도를 다시 학습"
              : wrong.length
                ? "남은 오답 재풀이"
                : "다른 문제로 적용 확인";
      return {
        topic,
        parentName: doc.topics.find((t) => t.id === topic.parentId)?.name ?? "",
        items: recorded,
        pairedCount: paired.length,
        count: recorded.length,
        my,
        external,
        gap,
        sessions: sessions.length,
        pairedSessions,
        registeredSessions: coverage.length,
        wrong,
        blank,
        loss: wrong.reduce((sum, i) => sum + i.points, 0),
        solved: solved.length,
        again: again.length,
        planned: planned.length,
        repeated,
        repeatedSessions,
        recent,
        status,
        action,
        transfer: {
          count: transfer.length,
          correct: transfer.filter((i) => i.correct).length,
        },
        comparisonCounts: Array.from(
          new Set(paired.map((i) => i.externalCohortCount)),
        ).sort((a, b) => (a ?? 0) - (b ?? 0)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.status === "우선 복습") - Number(a.status === "우선 복습") ||
        Number(b.repeated) - Number(a.repeated) ||
        b.loss - a.loss ||
        a.topic.code.localeCompare(b.topic.code),
    );
}

export function subjectPriorities(
  payload: LearningPayload,
  examTypeId: string,
  date: string,
  easyThreshold: number,
) {
  const type = payload.examTypes.find((t) => t.id === examTypeId);
  return (type?.subjects ?? [])
    .map((subject) => {
      const items = payload.items.filter(
          (i) =>
            i.examTypeId === examTypeId &&
            i.date === date &&
            i.subjectId === subject.id &&
            i.correct !== null,
        ),
        wrong = items.filter((i) => i.correct === false);
      const easy = wrong.filter(
        (i) =>
          Boolean(i.answer?.trim()) &&
          i.externalRate !== null &&
          i.externalRate >= easyThreshold,
      );
      const repeated = topicAnalytics(
        payload,
        examTypeId,
        subject.id,
        "0000-01-01",
        date,
        true,
      ).filter((t) => t.repeated);
      return {
        subject,
        items: items.length,
        wrong: wrong.length,
        blank: wrong.filter((i) => !i.answer?.trim()).length,
        loss: wrong.reduce((sum, i) => sum + i.points, 0),
        easyCount: easy.length,
        easyLoss: easy.reduce((sum, i) => sum + i.points, 0),
        repeated: repeated.map((t) => t.topic.name),
        action: !items.length
          ? "채점 자료 확인"
          : easy.length
            ? "많이 맞힌 문제 중 내 오답부터 복습"
            : repeated.length
              ? "반복 취약 진도 개념 확인"
              : wrong.length
                ? "남은 오답 풀이 과정 점검"
                : "다음 회차에서 유지 확인",
      };
    })
    .sort(
      (a, b) =>
        b.easyLoss - a.easyLoss ||
        b.repeated.length - a.repeated.length ||
        b.loss - a.loss,
    );
}
