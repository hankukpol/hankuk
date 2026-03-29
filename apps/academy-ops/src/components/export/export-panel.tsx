"use client";

import { useState } from "react";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
};

type ExportPanelProps = {
  periods: PeriodOption[];
};

export function ExportPanel({ periods }: ExportPanelProps) {
  const activePeriodId = periods.find((period) => period.isActive)?.id?.toString() ?? "";
  const [studentExamType, setStudentExamType] = useState<"GONGCHAE" | "GYEONGCHAE">("GONGCHAE");
  const [studentGeneration, setStudentGeneration] = useState("");
  const [studentActiveOnly, setStudentActiveOnly] = useState(true);
  const [scorePeriodId, setScorePeriodId] = useState<string>(activePeriodId);
  const [scoreExamType, setScoreExamType] = useState<"GONGCHAE" | "GYEONGCHAE">("GONGCHAE");
  const [rankingPeriodId, setRankingPeriodId] = useState<string>(activePeriodId);
  const [rankingExamType, setRankingExamType] = useState<"GONGCHAE" | "GYEONGCHAE">("GONGCHAE");
  const [rankingView, setRankingView] = useState<"overall" | "new">("overall");
  const [enrollmentPeriodId, setEnrollmentPeriodId] = useState<string>(activePeriodId);

  function downloadStudents(format: "csv" | "xlsx") {
    const params = new URLSearchParams({
      examType: studentExamType,
      format,
    });

    if (studentGeneration.trim()) {
      params.set("generation", studentGeneration.trim());
    }

    if (!studentActiveOnly) {
      params.set("activeOnly", "false");
    }

    window.location.href = `/api/export/students?${params.toString()}`;
  }

  function downloadScores(format: "csv" | "xlsx") {
    const params = new URLSearchParams({
      examType: scoreExamType,
      format,
    });

    if (scorePeriodId) {
      params.set("periodId", scorePeriodId);
    }

    window.location.href = `/api/export/scores?${params.toString()}`;
  }

  function downloadRanking(format: "csv" | "xlsx") {
    if (!rankingPeriodId) return;

    const params = new URLSearchParams({
      periodId: rankingPeriodId,
      examType: rankingExamType,
      view: rankingView,
      format,
    });

    window.location.href = `/api/export/ranking?${params.toString()}`;
  }

  function downloadEnrollments(format: "csv" | "xlsx") {
    if (!enrollmentPeriodId) return;

    const params = new URLSearchParams({
      periodId: enrollmentPeriodId,
      format,
    });

    window.location.href = `/api/export/enrollments?${params.toString()}`;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">수강생 명단</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          공채/경채, 활성 여부, 기수 조건으로 필터링한 명단을 CSV 또는 xlsx로 내려받습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={studentExamType}
            onChange={(event) =>
              setStudentExamType(event.target.value as typeof studentExamType)
            }
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
          <input
            value={studentGeneration}
            onChange={(event) => setStudentGeneration(event.target.value)}
            placeholder="기수"
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
          <label className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={studentActiveOnly}
              onChange={(event) => setStudentActiveOnly(event.target.checked)}
            />
            활성만 포함
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadStudents("xlsx")}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadStudents("csv")}
            className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            CSV 다운로드
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">성적 Raw</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          시험 기간과 직렬 기준으로 현재 저장된 원점수/OX/최종점수 원본 데이터를 내려받습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <select
            value={scorePeriodId}
            onChange={(event) => setScorePeriodId(event.target.value)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          >
            <option value="">전체 기간</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " / 현재 사용 중" : ""}
              </option>
            ))}
          </select>
          <select
            value={scoreExamType}
            onChange={(event) => setScoreExamType(event.target.value as typeof scoreExamType)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadScores("xlsx")}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadScores("csv")}
            className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            CSV 다운로드
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-xl font-semibold">석차 포함 성적</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          기간 전체 통합 석차를 평균·참여율·개근 여부와 함께 내려받습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <select
            value={rankingPeriodId}
            onChange={(event) => setRankingPeriodId(event.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 기간</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " / 현재 사용 중" : ""}
              </option>
            ))}
          </select>
          <select
            value={rankingExamType}
            onChange={(event) => setRankingExamType(event.target.value as typeof rankingExamType)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
          <select
            value={rankingView}
            onChange={(event) => setRankingView(event.target.value as typeof rankingView)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="overall">전체 (기존생+신규생)</option>
            <option value="new">신규생만</option>
          </select>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadRanking("xlsx")}
            disabled={!rankingPeriodId}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadRanking("csv")}
            disabled={!rankingPeriodId}
            className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            CSV 다운로드
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">기간별 수강생 명단</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          특정 기간에 등록된 수강생 명단을 수험번호·이름·직렬·등록일 포함하여 내려받습니다.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <select
            value={enrollmentPeriodId}
            onChange={(event) => setEnrollmentPeriodId(event.target.value)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          >
            <option value="">기간 선택 필수</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " / 현재 사용 중" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadEnrollments("xlsx")}
            disabled={!enrollmentPeriodId}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadEnrollments("csv")}
            disabled={!enrollmentPeriodId}
            className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            CSV 다운로드
          </button>
        </div>
      </section>
    </div>
  );
}
