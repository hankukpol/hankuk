"use client";

import { useState } from "react";

type ScoreRow = {
  id: number;
  examDate: string;
  subject: string;
  subjectLabel: string;
  finalScore: number | null;
  rawScore: number | null;
};

type Props = {
  scores: ScoreRow[];
};

type FormState =
  | { phase: "list" }
  | { phase: "form"; score: ScoreRow }
  | { phase: "success"; subjectLabel: string }
  | { phase: "error"; message: string };

export function ScoreCorrectionForm({ scores }: Props) {
  const [state, setState] = useState<FormState>({ phase: "list" });
  const [reportedScore, setReportedScore] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openForm(score: ScoreRow) {
    setReportedScore("");
    setReason("");
    setState({ phase: "form", score });
  }

  function backToList() {
    setState({ phase: "list" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.phase !== "form") return;

    const parsed = parseFloat(reportedScore);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setState({ phase: "error", message: "실제 점수는 0~100 사이의 숫자를 입력해 주세요." });
      return;
    }

    if (!reason.trim()) {
      setState({ phase: "error", message: "신고 사유를 입력해 주세요." });
      return;
    }

    const current = state.score;
    setSubmitting(true);

    try {
      const res = await fetch("/api/student/score-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreId: current.id,
          examDate: current.examDate,
          subject: current.subjectLabel,
          currentScore: current.finalScore,
          reportedScore: parsed,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        let msg = "신고 처리 중 오류가 발생했습니다.";
        try {
          const body = await res.json();
          if (body.error) msg = body.error;
        } catch {
          // ignore
        }
        setState({ phase: "error", message: msg });
        return;
      }

      setState({ phase: "success", subjectLabel: current.subjectLabel });
    } catch {
      setState({ phase: "error", message: "네트워크 오류가 발생했습니다. 다시 시도해 주세요." });
    } finally {
      setSubmitting(false);
    }
  }

  if (state.phase === "success") {
    return (
      <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-8 text-center">
        <div className="text-forest text-2xl font-bold">신고 완료</div>
        <p className="mt-3 text-sm text-slate">
          <span className="font-semibold">{state.subjectLabel}</span> 과목의 성적 오류가 신고되었습니다.
          담당자가 확인 후 1~2 영업일 이내에 처리합니다.
        </p>
        <button
          onClick={backToList}
          className="mt-6 inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          성적 목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="space-y-4">
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-700">{state.message}</p>
        </div>
        <button
          onClick={backToList}
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          돌아가기
        </button>
      </div>
    );
  }

  if (state.phase === "form") {
    const score = state.score;
    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-[20px] border border-ink/10 bg-mist p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">신고 대상 성적</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate">시험일</p>
              <p className="mt-1 font-semibold text-ink">{score.examDate}</p>
            </div>
            <div>
              <p className="text-xs text-slate">과목</p>
              <p className="mt-1 font-semibold text-ink">{score.subjectLabel}</p>
            </div>
            <div>
              <p className="text-xs text-slate">현재 점수 (최종)</p>
              <p className="mt-1 font-semibold text-ink">
                {score.finalScore !== null ? `${score.finalScore}점` : "미입력"}
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            실제 점수 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={reportedScore}
            onChange={(e) => setReportedScore(e.target.value)}
            placeholder="0 ~ 100"
            required
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate">실제 시험지에 표시된 점수를 입력해 주세요.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            신고 사유 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="예) 시험지 확인 결과 80점인데 시스템에 70점으로 입력되어 있습니다."
            required
            className="w-full resize-none rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember/50 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60"
          >
            {submitting ? "제출 중..." : "신고 제출"}
          </button>
          <button
            type="button"
            onClick={backToList}
            disabled={submitting}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ink/30 disabled:opacity-60"
          >
            취소
          </button>
        </div>
      </form>
    );
  }

  // phase === "list"
  return (
    <div>
      {scores.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          최근 20개의 성적 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">시험일</th>
                <th className="px-4 py-3 font-semibold">과목</th>
                <th className="px-4 py-3 font-semibold">최종 점수</th>
                <th className="px-4 py-3 font-semibold">원점수</th>
                <th className="px-4 py-3 font-semibold text-right">신고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {scores.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40">
                  <td className="px-4 py-3 text-slate">{row.examDate}</td>
                  <td className="px-4 py-3 font-medium">{row.subjectLabel}</td>
                  <td className="px-4 py-3">
                    {row.finalScore !== null ? `${row.finalScore}점` : (
                      <span className="text-slate">미입력</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.rawScore !== null ? `${row.rawScore}점` : (
                      <span className="text-slate">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openForm(row)}
                      className="inline-flex items-center rounded-full border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/10"
                    >
                      오류 신고
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
