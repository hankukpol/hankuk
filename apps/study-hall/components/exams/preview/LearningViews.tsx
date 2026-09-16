"use client";
import { useState } from "react";
import { DialogActions } from "@/components/ui/DialogActions";
import { useLearning } from "./LearningProvider";
import {
  topicAnalytics,
  subjectPriorities,
  seoulDay,
  latestReview,
} from "@/lib/exam-preview/learning-analytics";
import { policyAt } from "@/lib/exam-preview/learning-types";
import { regradeIssue } from "@/lib/exam-preview/learning-grading";
import type { PreviewData } from "@/lib/exam-preview/types";
import { SlideOver } from "@/components/ui/SlideOver";
import { LearningTable, value } from "./LearningTable";
import styles from "./preview.module.css";

export function TopicLearning({
  data,
  subject,
}: {
  data: PreviewData;
  subject: string;
}) {
  const learning = useLearning(),
    [cumulative, setCumulative] = useState(false),
    [reviewTopicId, setReviewTopicId] = useState("");
  const payload = learning?.data;
  if (!payload || !data.student) return null;
  const rows = topicAnalytics(
    payload,
    data.examType.id,
    subject,
    data.range.from,
    data.range.to,
    cumulative,
  );
  const reviewTopic = rows.find(
    (r) => r.topic.id === reviewTopicId && r.wrong.length > 0,
  );
  const items = payload.items.filter(
    (i) =>
      i.examTypeId === data.examType.id &&
      i.subjectId === subject &&
      i.date <= data.range.to &&
      (cumulative || i.date >= data.range.from),
  );
  const missing = items.filter(
    (i) => !payload.document.assignments[i.id],
  ).length;
  return (
    <section
      className="admin-flat-page"
      data-learning-summary
      aria-label="문항별 진도 학습 점검"
    >
      <div className="admin-workspace-toolbar">
        <h3 className="admin-section-title">진도별 취약점과 다음 학습</h3>
        <div
          className={styles.segmented}
          data-report-navigation
          aria-label="진도 분석 기간"
        >
          {[
            ["month", "조회 기간"],
            ["all", "누적"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={cumulative === (id === "all")}
              onClick={() => setCumulative(id === "all")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="admin-help">
        {cumulative
          ? `첫 기록 ~ ${data.range.to}`
          : `${data.range.from} ~ ${data.range.to}`}{" "}
        · 표준 진도에 연결된 같은 문항끼리 비교합니다. 내 오답은 답안 미선택을
        포함합니다. 비교 정답률은 통계가 있는 문항만 사용합니다.
      </p>
      {missing > 0 && (
        <p className="admin-notice">
          진도 미연결 {missing}문항은 진도별 판단에서 제외됩니다. 관리자
          ‘진도·학습 분석 설정’에서 연결할 수 있습니다.
        </p>
      )}
      <LearningTable
        label="문항별 진도 비교"
        className={styles.topicLearningTable}
        heads={[
          "대단원 / 세부 진도",
          "채점 문항",
          "비교 문항",
          "비교 내 정답률",
          "같은 문항 전체 정답률",
          "차이",
          "응시 회차",
          "비교 회차",
          "판단",
          "다음 학습",
        ]}
        rows={rows.map((r) => [
          <>
            {r.parentName}
            <br />
            <strong>{r.topic.name}</strong>
          </>,
          `${r.count}문항`,
          `${r.pairedCount}문항`,
          value(r.my, "%"),
          value(r.external, "%"),
          value(r.gap, "%p"),
          `${r.sessions}회`,
          `${r.pairedSessions}회`,
          r.status,
          <div key="next-action">
            {r.action}
            {r.wrong.length > 0 && (
              <button
                type="button"
                className="admin-table-link"
                data-report-navigation
                aria-label={`${r.topic.name} 오답 ${r.wrong.length}문항 보기`}
                onClick={() => setReviewTopicId(r.topic.id)}
              >
                오답 {r.wrong.length}문항 보기
              </button>
            )}
          </div>,
        ])}
      />
      {reviewTopic && (
        <div
          data-report-navigation
          className="admin-flat-page"
          aria-label="선택 진도 복습"
        >
          <div className="admin-workspace-toolbar">
            <h3 className="admin-section-title">
              {reviewTopic.topic.name} · 오답 {reviewTopic.wrong.length}문항
            </h3>
            <button
              type="button"
              className="admin-text-action"
              onClick={() => setReviewTopicId("")}
            >
              진도 복습 닫기
            </button>
          </div>
          <p className="admin-help">
            {cumulative ? "누적 기록" : "조회 기간"}의 이 진도 오답 전체입니다.
            시험일과 문항 번호를 확인하고 함께 예약하거나 재풀이할 수 있습니다.
          </p>
          <ReviewWorkbench
            key={`${subject}:${reviewTopic.topic.id}:${cumulative}:${data.range.from}:${data.range.to}`}
            data={data}
            subject={subject}
            ids={reviewTopic.wrong.map((i) => i.id)}
            range={{
              from: cumulative ? "0000-01-01" : data.range.from,
              to: data.range.to,
            }}
          />
        </div>
      )}
      <details className="admin-disclosure">
        <summary>비교 집단과 판단 기준</summary>
        <div className="admin-disclosure-body admin-help">
          전체 정답률은 가져온 시험의 문항별 통계입니다. 여러 회차는 같은
          사람들의 누적 집단으로 합치지 않고 문항별 정답률을 평균합니다.
          파일에는 문항별 외부 분석 인원이 없어 정확한 문항별 인원은 확인할 수
          없습니다. 과목 응시 인원과 학원 문항 응답 인원은 오답·문항 분석에서
          별도로 확인하세요. 비교 회차는 내 채점과 전체 정답률이 함께 있는
          문항의 시험 횟수입니다. 분석 기준은 학원 설정의 적용일을 따르며 비교
          문항·회차 수가 부족하면 판단을 보류합니다.
        </div>
      </details>
      <h3 className="admin-section-title">반복 오답과 복습 후 확인</h3>
      <LearningTable
        label="진도별 복습 개선"
        heads={[
          "세부 진도",
          "내 오답률",
          "오답 문항",
          "손실 배점",
          "오답 발생 회차",
          "복습 예정",
          "재풀이 해결",
          "다시 틀림",
        ]}
        rows={rows
          .filter((r) => r.count > 0)
          .map((r) => [
            r.topic.name,
            value(r.count ? (r.wrong.length / r.count) * 100 : null, "%"),
            `${r.wrong.length}문항`,
            value(r.loss, "점"),
            `${r.repeatedSessions}회${r.repeated ? " · 반복 점검" : ""}`,
            `${r.planned}문항`,
            `${r.solved}문항`,
            `${r.again}문항`,
          ])}
      />
      <details className="admin-disclosure">
        <summary>같은 진도의 최근 응시 결과 비교</summary>
        <div className="admin-disclosure-body">
          <LearningTable
            label="최근 두 회차 진도 비교"
            heads={[
              "세부 진도",
              "이전 시험일",
              "이전 문항 수",
              "이전 정답률",
              "최근 시험일",
              "최근 문항 수",
              "최근 정답률",
              "변화",
            ]}
            rows={rows
              .filter((r) => r.recent.length > 0)
              .map((r) => {
                const prior = r.recent.length > 1 ? r.recent[0] : null,
                  last = r.recent.at(-1)!;
                return [
                  r.topic.name,
                  prior?.date ?? "기록 없음",
                  value(prior?.count, "문항"),
                  value(prior?.rate, "%"),
                  last.date,
                  `${last.count}문항`,
                  value(last.rate, "%"),
                  value(prior ? last.rate - prior.rate : null, "%p"),
                ];
              })}
          />
        </div>
      </details>
      {rows.some((r) => r.transfer.count > 0) ? (
        <LearningTable
          label="아침 복습 후 정기 새 문항 적용"
          heads={[
            "세부 진도",
            "후속 정기 분석 문항",
            "정답 문항",
            "새 문항 정답률",
          ]}
          rows={rows
            .filter((r) => r.transfer.count > 0)
            .map((r) => [
              r.topic.name,
              `${r.transfer.count}문항`,
              `${r.transfer.correct}문항`,
              value((r.transfer.correct / r.transfer.count) * 100, "%"),
            ])}
        />
      ) : (
        <p className="admin-help">
          아침에서 복습한 진도의 후속 정기시험 문항은 아직 없습니다.
        </p>
      )}
      <p className="admin-help">
        복습 상태는 현재까지의 기록이며, 재풀이 해결은 같은 문제의 최근 재풀이
        결과입니다. 후속 정기시험은 조회 종료일까지 확인합니다. 정기 새 문항은
        아침 복습 성공일 이후 같은 표준 진도로 출제된 다른 문항입니다. 서로 다른
        문제의 정답률 변화는 참고 자료이며 복습 효과나 실력 향상을 단정하지
        않습니다.
      </p>
    </section>
  );
}

export function LearningPriorities({
  data,
  onSubject,
}: {
  data: PreviewData;
  onSubject: (id: string) => void;
}) {
  const learning = useLearning();
  if (!learning?.data || !data.student) return null;
  const rows = subjectPriorities(
    learning.data,
    data.examType.id,
    data.range.to,
    data.easyThreshold,
  );
  return (
    <section className="admin-flat-page" data-learning-summary>
      <h3 className="admin-section-title">다음에 공부할 과목</h3>
      <LearningTable
        label="과목별 학습 우선순위"
        heads={[
          "순서 / 과목",
          "채점 문항",
          "손실 배점",
          "많이 맞힌 문제 중 내 오답",
          "반복 오답 진도",
          "다음 학습",
        ]}
        rows={rows.map((r, index) => [
          <span key="subject-label">
            <span className="preview-print-only">
              {index + 1}. {r.subject.name}
            </span>
            <button
              key="subject"
              data-report-navigation
              className="admin-table-link"
              type="button"
              onClick={() => onSubject(r.subject.id)}
            >
              {index + 1}. {r.subject.name}
            </button>
          </span>,
          `${r.items}문항`,
          value(r.loss, "점"),
          `${r.easyCount}문항 / ${value(r.easyLoss, "점")}`,
          r.repeated.join(", ") || "확인된 반복 없음",
          r.action,
        ])}
      />
      <p className="admin-help">
        많이 맞힌 문제에서 잃은 배점 → 반복 오답 진도 → 전체 손실 배점 순입니다.
        손실 배점은 오답의 실제 배점 합계이며 예상 상승 점수가 아닙니다. 채점
        기록 자체가 없는 문항은 손실 배점에 넣지 않습니다. 제출 답안을 비운
        문항은 내 오답과 손실 배점에 포함합니다.
      </p>
    </section>
  );
}

export function ReviewWorkbench({
  data,
  subject,
  ids,
  range,
}: {
  data: PreviewData;
  subject: string;
  ids?: string[];
  range?: { from: string; to: string };
}) {
  const learning = useLearning(),
    [selected, setSelected] = useState<string[]>([]),
    [due, setDue] = useState(() => seoulDay(new Date().toISOString())),
    [itemId, setItemId] = useState(""),
    [answer, setAnswer] = useState(""),
    [message, setMessage] = useState("");
  const payload = learning?.data;
  if (!learning || !payload || !data.student) return null;
  const today = seoulDay(new Date().toISOString());
  const included = ids ? new Set(ids) : null;
  const items = payload.items.filter(
    (i) =>
      i.examTypeId === data.examType.id &&
      i.subjectId === subject &&
      i.date >=
        (range?.from ??
          (data.kind === "regular" ? data.range.to : data.range.from)) &&
      i.date <= (range?.to ?? data.range.to) &&
      i.correct === false &&
      (!included || included.has(i.id)),
  );
  const chosen = selected.filter((id) => items.some((i) => i.id === id)),
    item = items.find((i) => i.id === itemId);
  const chosenSet = new Set(chosen);
  const status = (id: string) => {
    const history = latestReview(payload, id, today);
    return !history.length
      ? "복습 전"
      : history[0].action === "plan"
        ? `복습 예정 ${history[0].dueDate}`
        : history[0].correct
          ? "해결"
          : "다시 틀림";
  };
  const history = item ? latestReview(payload, item.id, today) : [];
  const gradingIssue = item
    ? regradeIssue(item.answerKey, Object.keys(item.choices))
    : null;
  return (
    <section className="admin-flat-page" aria-label="복습과 재풀이 기록">
      <h3 className="admin-section-title">복습 예약과 재풀이</h3>
      <p className="admin-help">
        시험지에서 선택한 문제를 다시 풀고 답을 기록하세요. 원래 시험 점수는
        바뀌지 않습니다. 답을 비운 오답도 함께 복습할 수 있습니다.
      </p>
      {message && (
        <p role="status" className="admin-notice">
          {message}
        </p>
      )}
      <div className="admin-filter-bar" data-report-navigation>
        <label className="admin-label">
          복습 예정일
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="admin-button admin-button-secondary"
          disabled={!items.length}
          onClick={() =>
            setSelected(
              chosen.length === items.length ? [] : items.map((i) => i.id),
            )
          }
        >
          {chosen.length === items.length ? "선택 해제" : "오답 전체 선택"}
        </button>
        <button
          type="button"
          className="admin-button admin-button-primary"
          disabled={learning.busy || !chosen.length || !due}
          onClick={async () => {
            if (
              await learning.save({
                action: "plan",
                studentId: data.student!.id,
                itemIds: chosen,
                dueDate: due,
              })
            ) {
              setMessage(`${chosen.length}문항의 복습 일정을 저장했습니다.`);
              setSelected([]);
            }
          }}
        >
          선택 {chosen.length}문항 예약
        </button>
      </div>
      <LearningTable
        label="복습 대상과 최근 결과"
        heads={[
          "시험일",
          "문항 번호",
          "세부 진도",
          "배점",
          "복습 상태",
          "선택 / 재풀이",
        ]}
        rows={items.map((i) => [
          i.date,
          `${i.itemNo}번`,
          payload.document.topics.find(
            (t) => t.id === payload.document.assignments[i.id],
          )?.name ?? "진도 미연결",
          value(i.points, "점"),
          status(i.id),
          <div
            key="actions"
            className="flex flex-wrap items-center justify-center gap-2"
            data-report-navigation
          >
            <input
              type="checkbox"
              aria-label={`${i.date} ${i.itemNo}번 복습 선택`}
              checked={chosenSet.has(i.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? chosen.concat(i.id)
                    : chosen.filter((id) => id !== i.id),
                )
              }
            />
            <button
              className="admin-table-link"
              type="button"
              onClick={() => {
                setItemId(i.id);
                setAnswer("");
                setMessage("");
              }}
            >
              {i.itemNo}번 재풀이
            </button>
          </div>,
        ])}
      />
      <SlideOver
        open={Boolean(item)}
        title={
          item
            ? `${item.date} ${item.subjectName} ${item.itemNo}번 재풀이`
            : "재풀이"
        }
        onClose={() => setItemId("")}
      >
        <div className="space-y-4">
          {item && (
            <>
              <p className="admin-help">
                시험지의 문제를 다시 풀고 답을 선택하세요. 아래 기록에 최근
                결과와 이전 시도가 모두 남습니다.
              </p>
              <label className="admin-label block">
                재풀이 답안
                {Object.keys(item.choices).length ? (
                  <select
                    aria-label="재풀이 답안"
                    value={answer}
                    disabled={Boolean(gradingIssue)}
                    onChange={(e) => setAnswer(e.target.value)}
                  >
                    <option value="">답안 선택</option>
                    {Object.keys(item.choices).map((k) => (
                      <option key={k} value={k}>
                        {k}번
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="재풀이 답안"
                    value={answer}
                    disabled={Boolean(gradingIssue)}
                    maxLength={30}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                )}
              </label>
              {gradingIssue && (
                <p role="status" className="admin-notice">
                  {gradingIssue} 복습 예약과 기존 채점 결과는 유지됩니다.
                </p>
              )}
              <DialogActions>
                <button
                  className="admin-button admin-button-primary"
                  type="button"
                  disabled={learning.busy || !answer || Boolean(gradingIssue)}
                  onClick={async () => {
                    if (
                      await learning.save({
                        action: "attempt",
                        studentId: data.student!.id,
                        itemId: item.id,
                        answer,
                      })
                    ) {
                      setAnswer("");
                      setMessage("재풀이 결과를 저장했습니다.");
                    }
                  }}
                >
                  채점하고 기록
                </button>
              </DialogActions>
              {learning.error && <p role="alert">{learning.error}</p>}
              <p role="status" className="admin-notice">
                {status(item.id)}
              </p>
              <LearningTable
                label="문항 복습 이력"
                heads={["기록일", "구분", "답안", "결과"]}
                rows={history.map((r) => [
                  new Date(r.at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  }),
                  r.action === "plan" ? `예정 ${r.dueDate}` : "재풀이",
                  r.answer ?? "-",
                  r.action === "plan"
                    ? "예정"
                    : r.correct
                      ? "해결"
                      : "다시 틀림",
                ])}
              />
            </>
          )}
        </div>
      </SlideOver>
    </section>
  );
}

export function ExamTimeEntry({ data }: { data: PreviewData }) {
  const learning = useLearning(),
    [sessionId, setSessionId] = useState(""),
    [total, setTotal] = useState(""),
    [times, setTimes] = useState<Record<string, string>>({}),
    [ranOut, setRanOut] = useState(false),
    [saved, setSaved] = useState(false);
  const payload = learning?.data,
    policy = payload
      ? policyAt(payload.document, seoulDay(new Date().toISOString()))
      : null;
  if (!learning || !payload || !data.student || !policy?.timeTracking)
    return null;
  const sessions = payload.sessions.filter(
      (s) =>
        s.examTypeId === data.examType.id &&
        s.taken &&
        s.date >= data.range.from &&
        s.date <= data.range.to,
    ),
    selected = sessions.find((s) => s.id === sessionId) ?? sessions.at(-1);
  if (!selected) return null;
  const selectedSubjects = new Set(selected.subjectIds);
  const records = payload.document.times
      .filter((t) => t.sessionId === selected.id)
      .slice()
      .reverse(),
    latest = records[0],
    limit = policyAt(payload.document, selected.date)?.timeLimits[
      data.examType.id
    ];
  return (
    <details className="admin-disclosure">
      <summary>풀이시간 점검 · 선택 입력</summary>
      <div className="admin-disclosure-body space-y-4">
        <p className="admin-help">
          종이시험에서 직접 잰 시간을 입력합니다. 시간을 기록하지 않으면
          추정하지 않습니다. 제한 시간은 선택한 시험일에 적용되는 기준입니다.
        </p>
        <form
          data-report-navigation
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await learning.save({
                action: "time",
                studentId: data.student!.id,
                sessionId: selected.id,
                totalMinutes: Number(total),
                subjectMinutes: Object.fromEntries(
                  selected.subjectIds
                    .filter((id) => times[id]?.trim())
                    .map((id) => [id, Number(times[id])]),
                ),
                ranOut,
              })
            )
              setSaved(true);
          }}
        >
          <div className="admin-filter-bar">
            <label className="admin-label">
              시험일
              <select
                aria-label="시간 기록 시험일"
                value={selected.id}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  setTotal("");
                  setTimes({});
                  setRanOut(false);
                  setSaved(false);
                }}
              >
                {sessions.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.date}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-label">
              총 소요시간 (분)
              <input
                required
                type="number"
                min="0"
                max="1440"
                step="0.1"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </label>
            {data.subjects
              .filter((s) => selectedSubjects.has(s.id))
              .map((s) => (
                <label className="admin-label" key={s.id}>
                  {s.name} (분)
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    step="0.1"
                    value={times[s.id] ?? ""}
                    onChange={(e) =>
                      setTimes({ ...times, [s.id]: e.target.value })
                    }
                  />
                </label>
              ))}
          </div>
          <label className="admin-label flex items-center gap-2">
            <input
              type="checkbox"
              checked={ranOut}
              onChange={(e) => setRanOut(e.target.checked)}
            />
            시간이 부족해 다 풀지 못함
          </label>
          <button
            type="submit"
            disabled={learning.busy}
            className="admin-button admin-button-primary"
          >
            시간 기록 저장
          </button>
          {saved && <p role="status">저장했습니다.</p>}
        </form>
        <LearningTable
          label="최근 시간 기록"
          heads={["시험일", "제한 시간", "총 소요시간", "시간 부족", "점검"]}
          rows={
            latest
              ? [
                  [
                    selected.date,
                    value(limit, "분"),
                    value(latest.totalMinutes, "분"),
                    latest.ranOut ? "예" : "아니요",
                    latest.ranOut
                      ? "시간을 많이 쓴 과목과 미선택 문항부터 확인"
                      : limit && latest.totalMinutes > limit
                        ? "설정 시간 초과 · 과목별 시간 배분 점검"
                        : "다음 실전에서 시간 배분 유지",
                  ],
                ]
              : []
          }
        />
        <details className="admin-disclosure">
          <summary>시간 입력 이력</summary>
          <div className="admin-disclosure-body">
            <LearningTable
              label="시간 입력 이력"
              heads={["입력일", "총 소요시간", "과목별 시간", "시간 부족"]}
              rows={records.map((r) => [
                new Date(r.at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                }),
                value(r.totalMinutes, "분"),
                Object.entries(r.subjectMinutes)
                  .map(
                    ([id, n]) =>
                      `${data.subjects.find((s) => s.id === id)?.name ?? id} ${n}분`,
                  )
                  .join(", "),
                r.ranOut ? "예" : "아니요",
              ])}
            />
          </div>
        </details>
      </div>
    </details>
  );
}
