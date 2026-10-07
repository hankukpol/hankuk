"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { StudyInterviewView } from "@/lib/services/study-diagnosis.service";

type InterviewScorePanelProps = {
  divisionSlug: string;
  studentId: string;
  /** 성적 분석·상담 자료 링크와 같은 기간. 없으면 서버 기본(오늘까지 4주). */
  range?: { from: string; to: string };
};

const noticeTone: Record<string, string> = {
  danger: " admin-notice-danger",
  warning: " admin-notice-warning",
  success: " admin-notice-success",
  info: "",
};

const toneText: Record<string, string> = {
  danger: "text-admin-danger",
  warning: "text-admin-warning",
  success: "text-admin-success",
  info: "",
};

function shortDate(value: string) {
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
}

/**
 * 면담 기록 슬라이드의 성적 요약(운영자 요청 2026-10-07). 성적 화면을 새 탭으로 열지 않아도
 * 면담 중에 학생 성적표와 같은 결론·과목 상태·먼저 볼 시험을 본다.
 * 숫자·문장은 개인 성적표와 같은 함수에서 나온다(lib/interview-score-summary.ts).
 */
export function useStudyInterviewView(divisionSlug: string, studentId: string, range?: { from: string; to: string }) {
  const from = range?.from;
  const to = range?.to;
  const [state, setState] = useState<{ studentId: string; context: StudyInterviewView | null; error: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    const period = from && to ? `&from=${from}&to=${to}` : "";
    fetch(`/api/${divisionSlug}/interviews/study-context?studentId=${encodeURIComponent(studentId)}${period}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "성적 요약을 불러오지 못했습니다.");
        setState({ studentId, context: data.context as StudyInterviewView, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ studentId, context: null, error: error instanceof Error ? error.message : "성적 요약을 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [divisionSlug, studentId, from, to]);

  return state && state.studentId === studentId ? state : null;
}

export function InterviewScorePanel({ divisionSlug, studentId, range }: InterviewScorePanelProps) {
  const state = useStudyInterviewView(divisionSlug, studentId, range);

  if (!state) {
    return (
      <div className="admin-notice mt-4 flex items-center gap-2">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        성적 요약을 불러오는 중입니다.
      </div>
    );
  }

  if (state.error) return <div className="admin-notice mt-4">{state.error}</div>;

  const context = state.context;
  if (!context || !context.examEnabled) return null;
  return <ScoreSummaryView context={context} />;
}

/** 성적 요약 패널 본문. 학습 면담 편집기도 같은 모양을 쓴다. */
export function ScoreSummaryView({ context }: { context: StudyInterviewView }) {
  const { morning, regular } = context.scores;

  return (
    <section className="admin-panel mt-4" aria-label="성적 요약">
      <div className="admin-panel-header">
        <div className="min-w-0">
          <h3 className="admin-section-title">성적 요약</h3>
          <p className="admin-help mt-1">
            아침 모의고사 {shortDate(context.range.from)} ~ {shortDate(context.range.to)} · 학생 성적표와 같은 기준
          </p>
        </div>
      </div>

      {!morning && !regular ? (
        <p className="admin-panel-row admin-help">이 기간에 시험 성적이 없습니다.</p>
      ) : null}

      {morning ? (
        <>
          <p className={`admin-notice m-4${noticeTone[morning.headline.tone] ?? ""}`}>{morning.headline.text}</p>
          {morning.subjects.length ? (
            <div className="admin-table-frame">
              <table aria-label="아침 모의고사 과목별 상태">
                <thead>
                  <tr><th scope="col">과목</th><th scope="col">내 평균</th><th scope="col">전체 평균과 차이</th><th scope="col">상태</th></tr>
                </thead>
                <tbody>
                  {morning.subjects.map((subject) => (
                    <tr key={subject.subjectId}>
                      <th scope="row">{subject.name}</th>
                      <td className="admin-table-amount">{subject.my ?? "—"}</td>
                      <td className={`admin-table-amount ${subject.gap === null || subject.gap === 0 ? "" : subject.gap > 0 ? "text-admin-success" : "text-admin-danger"}`}>{subject.gapText}</td>
                      <td className={subject.status === "fail" || subject.status === "first" || subject.status === "review" ? "text-admin-danger" : subject.status === "good" ? "text-admin-success" : ""}>
                        {subject.statusLabel}
                        {subject.few ? <span className="admin-help block">{subject.paired}회 기록 · 참고</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {morning.study.length ? (
            <div className="admin-panel-row items-start">
              <span className="admin-label w-28 shrink-0 pt-1">먼저 볼 시험</span>
              <ul className="min-w-0 flex-1 space-y-1">
                {morning.study.map((row) => (
                  <li key={`${row.subjectId}-${row.date}`} className="break-keep">
                    <span className="font-semibold">{row.subjectName}</span>
                    <span className="admin-help ml-2 tabular-nums">{shortDate(row.date)}{row.topic ? ` · ${row.topic}` : ""} · {row.gapText}</span>
                    <span className="block text-[13px]">
                      {row.easyItemNos.length ? <span className="font-semibold text-admin-danger">많이 맞힌 문제 중 틀림 {row.easyItemNos.join(", ")}번</span> : null}
                      {row.easyItemNos.length && row.otherItemNos.length ? <span className="admin-help"> · </span> : null}
                      {row.otherItemNos.length ? <span className="admin-help">그 외 {row.otherItemNos.join(", ")}번</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {regular ? (
        <div className="admin-panel-row items-start">
          <span className="admin-label w-28 shrink-0 pt-1">정기 {shortDate(regular.date)}</span>
          <div className="min-w-0 flex-1">
            <p className={`break-keep ${toneText[regular.headline.tone] ?? ""}`}>{regular.headline.text}</p>
            <p className="admin-help mt-1 break-keep">
              {regular.subjects.map((subject, index) => (
                <span key={subject.name}>
                  {index ? " · " : ""}
                  {subject.name} {subject.my}/{subject.fullScore} <span className={toneText[subject.tone] ?? ""}>{subject.verdict}</span>
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
