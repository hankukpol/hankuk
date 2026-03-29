"use client";

import { useState } from "react";
import Link from "next/link";

export type CounselorOutcome = {
  counselorName: string;
  totalSessions: number;
  successCount: number;
  successRate: number;
  avgImprovement: number | null;
  sessions: CounselingSessionDetail[];
};

export type CounselingSessionDetail = {
  id: number;
  examNumber: string;
  studentName: string;
  counseledAt: string;
  preAvg: number | null;
  postAvg: number | null;
  improvement: number | null;
};

type Props = {
  counselors: CounselorOutcome[];
  totalSessions: number;
  successCount: number;
  avgImprovement: number | null;
  topCounselor: string | null;
  periodDays: number;
};

function successRateBadge(rate: number): string {
  if (rate >= 50) return "border-forest/20 bg-forest/10 text-forest";
  if (rate >= 30) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-600";
}

export function OutcomesClient({
  counselors,
  totalSessions,
  successCount,
  avgImprovement,
  topCounselor,
  periodDays,
}: Props) {
  const [selectedCounselor, setSelectedCounselor] = useState<string | null>(null);

  const selected = counselors.find((c) => c.counselorName === selectedCounselor) ?? null;

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 상담 건수</p>
          <p className="mt-3 text-3xl font-semibold">
            {totalSessions}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">최근 {periodDays}일 기간</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 ${
            successCount > 0
              ? "border-forest/20 bg-forest/5"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">성과 있음</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              successCount > 0 ? "text-forest" : ""
            }`}
          >
            {successCount}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">상담 후 성적 향상 건수</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">평균 성적 향상</p>
          <p className="mt-3 text-3xl font-semibold">
            {avgImprovement !== null ? (
              <>
                {avgImprovement > 0 ? "+" : ""}
                {avgImprovement.toFixed(1)}
                <span className="ml-1 text-base font-normal text-slate">점</span>
              </>
            ) : (
              <span className="text-slate">-</span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate">상담 전후 평균 점수 차</p>
        </article>

        <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <p className="text-sm text-slate">최고 성과 상담사</p>
          <p className="mt-3 text-xl font-semibold text-ember">
            {topCounselor ?? "-"}
          </p>
          <p className="mt-2 text-xs text-slate">성공률 기준 최고 성과자</p>
        </article>
      </div>

      {/* Counselor table */}
      <section className="rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-xl font-semibold">상담사별 효과 분석</h2>
          <p className="mt-1 text-sm text-slate">
            상담사 이름을 클릭하면 해당 상담사의 세부 면담 기록을 확인할 수 있습니다.
          </p>
        </div>

        {counselors.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            해당 기간에 상담 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/60 text-left">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    상담사
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    총 면담
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    성과 건수
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    성공률
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    평균 성적 향상
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {counselors.map((c) => (
                  <tr
                    key={c.counselorName}
                    className={`cursor-pointer transition hover:bg-mist/40 ${
                      selectedCounselor === c.counselorName ? "bg-mist/60" : ""
                    }`}
                    onClick={() =>
                      setSelectedCounselor(
                        selectedCounselor === c.counselorName ? null : c.counselorName
                      )
                    }
                  >
                    <td className="px-6 py-4 font-semibold text-ember">
                      {c.counselorName}
                    </td>
                    <td className="px-6 py-4">{c.totalSessions}건</td>
                    <td className="px-6 py-4">{c.successCount}건</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${successRateBadge(
                          c.successRate
                        )}`}
                      >
                        {c.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {c.avgImprovement !== null ? (
                        <span
                          className={
                            c.avgImprovement > 0 ? "text-forest font-medium" : "text-red-600"
                          }
                        >
                          {c.avgImprovement > 0 ? "+" : ""}
                          {c.avgImprovement.toFixed(1)}점
                        </span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Counselor drill-down */}
      {selected && (
        <section className="rounded-[28px] border border-sky-200 bg-sky-50/40 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {selected.counselorName} 상담 세부 내역
              </h2>
              <p className="mt-1 text-sm text-slate">
                총 {selected.totalSessions}건 · 성공률 {selected.successRate.toFixed(1)}%
              </p>
            </div>
            <button
              onClick={() => setSelectedCounselor(null)}
              className="rounded-full border border-sky-200 bg-white px-4 py-1.5 text-sm font-medium text-slate transition hover:border-sky-400"
            >
              닫기
            </button>
          </div>

          <div className="overflow-x-auto rounded-[22px] border border-sky-200 bg-white">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/60 text-left">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    학생
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    상담일
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    상담 전 평균
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    상담 후 평균
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    변화
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {selected.sessions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-slate"
                    >
                      세부 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  selected.sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-mist/30 transition">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-semibold text-ember transition hover:underline"
                        >
                          {s.studentName}
                        </Link>
                        <p className="text-xs text-slate">{s.examNumber}</p>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {new Date(s.counseledAt).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        {s.preAvg !== null ? (
                          <span>{s.preAvg.toFixed(1)}점</span>
                        ) : (
                          <span className="text-slate">데이터 없음</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {s.postAvg !== null ? (
                          <span>{s.postAvg.toFixed(1)}점</span>
                        ) : (
                          <span className="text-slate">데이터 없음</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {s.improvement !== null ? (
                          <span
                            className={`font-medium ${
                              s.improvement > 0
                                ? "text-forest"
                                : s.improvement < 0
                                ? "text-red-600"
                                : "text-slate"
                            }`}
                          >
                            {s.improvement > 0 ? "+" : ""}
                            {s.improvement.toFixed(1)}점
                          </span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
