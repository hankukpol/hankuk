"use client";

import { useEffect, useMemo, useState } from "react";

type PublicOverviewRow = {
  regionId: number;
  regionName: string;
  examType: string;
  examTypeLabel: string;
  recruitCount: number;
  applicantCount: number | null;
  competitionRate: number | null;
  participantCount: number;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  averageVisible: boolean;
  oneMultipleVisible: boolean;
  oneMultipleDisclosureTarget: number;
  snapshotPublished: boolean;
};

type PublicOverviewPayload = {
  exam: {
    name: string;
    year: number;
    round: number;
  };
  operationStage: {
    label: string;
    description: string;
  };
  latestRelease: {
    releaseNumber: number;
    releasedAt: string;
  } | null;
  rows: PublicOverviewRow[];
  error?: string;
};

function formatCount(value: number | null) {
  return value === null ? "미입력" : `${value.toLocaleString("ko-KR")}명`;
}

function formatScore(value: number | null) {
  return value === null ? "표본 축적 중" : `${value.toFixed(2)}점`;
}

function formatPublishedScore(value: number | null, snapshotPublished: boolean) {
  return snapshotPublished ? formatScore(value) : "집계 발표 전";
}

export default function PublicExamOverviewPanel() {
  const [data, setData] = useState<PublicOverviewPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedExamType, setSelectedExamType] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/public/overview", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as PublicOverviewPayload;
        if (!response.ok) throw new Error(payload.error ?? "공개 현황을 불러오지 못했습니다.");
        if (!cancelled) setData(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "공개 현황을 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeRegionRows = useMemo(() => data?.rows ?? [], [data]);

  const examTypeOptions = useMemo(
    () => [...new Map(activeRegionRows.map((row) => [row.examType, row.examTypeLabel.replace(/ (남|여)$/, "")])).entries()],
    [activeRegionRows]
  );
  const effectiveExamType =
    selectedExamType && examTypeOptions.some(([value]) => value === selectedExamType)
      ? selectedExamType
      : examTypeOptions[0]?.[0] ?? "";
  const visibleRows = activeRegionRows.filter((row) => row.examType === effectiveExamType);

  if (errorMessage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {errorMessage}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        지역별 시험 현황을 불러오는 중입니다.
      </section>
    );
  }

  return (
    <section className="border-t border-slate-200 pt-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="user-section-title">활성 지역 시험 현황</h2>
          <p className="mt-1 text-sm text-slate-600">
            {data.exam.year}년 {data.exam.round}차 {data.exam.name}
          </p>
        </div>
        <div className="border-l-2 border-service-500 pl-3 text-sm text-service-800">
          <p className="font-semibold">{data.operationStage.label}</p>
          <p className="mt-1 text-xs">{data.operationStage.description}</p>
        </div>
      </div>

      {examTypeOptions.length > 1 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {examTypeOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedExamType(value)}
              className={`inline-flex h-11 items-center rounded-md border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-400 ${
 effectiveExamType === value
 ? "border-service-600 bg-service-600 text-white"
 : "border-slate-200 bg-white text-slate-700 hover:border-service-300 hover:bg-service-50"
 }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {visibleRows.length > 0 ? (
        <>
          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="data-table w-full min-w-[880px]">
              <thead>
                <tr>
                  <th className="">지역·채용</th>
                  <th className="">모집</th>
                  <th className="">출원</th>
                  <th className="">경쟁률</th>
                  <th className="">발표 표본</th>
                  <th className="">입력자 평균</th>
                  <th className="">표본 1배수 지점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={`${row.regionId}-${row.examTypeLabel}`}>
                    <td className="font-semibold text-slate-900">
                      {row.regionName} {row.examTypeLabel}
                    </td>
                    <td className="tabular-nums">{formatCount(row.recruitCount)}</td>
                    <td className="tabular-nums">{formatCount(row.applicantCount)}</td>
                    <td className="tabular-nums">
                      {row.competitionRate === null ? "미입력" : `${row.competitionRate.toFixed(2)} : 1`}
                    </td>
                    <td className="tabular-nums">
                      {row.snapshotPublished ? formatCount(row.participantCount) : "미발표"}
                    </td>
                    <td className="tabular-nums text-slate-700">
                      {formatPublishedScore(row.averageScore, row.snapshotPublished)}
                    </td>
                    <td className="tabular-nums font-semibold text-service-700">
                      {formatPublishedScore(row.oneMultipleCutScore, row.snapshotPublished)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-list-flat mt-5 border-y border-slate-200 md:hidden">
            {visibleRows.map((row) => (
              <article key={`${row.regionId}-${row.examTypeLabel}`} className="px-4 py-4">
                <h3 className="font-semibold text-slate-900">{row.regionName} {row.examTypeLabel}</h3>
                <dl className="user-metric-pairs mt-3" data-cols="2">
                  <div><dt>모집·출원</dt><dd>{formatCount(row.recruitCount)} · {formatCount(row.applicantCount)}</dd></div>
                  <div><dt>발표 표본</dt><dd>{row.snapshotPublished ? formatCount(row.participantCount) : "미발표"}</dd></div>
                  <div><dt>입력자 평균</dt><dd>{formatPublishedScore(row.averageScore, row.snapshotPublished)}</dd></div>
                  <div><dt>표본 1배수 지점</dt><dd data-tone="accent">{formatPublishedScore(row.oneMultipleCutScore, row.snapshotPublished)}</dd></div>
                </dl>
                {row.snapshotPublished && !row.oneMultipleVisible ? (
                  <p className="mt-3 text-xs text-slate-500">
                    표본 1배수 지점 표시 기준 {row.participantCount.toLocaleString("ko-KR")}/{row.oneMultipleDisclosureTarget.toLocaleString("ko-KR")}명
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          현재 공개할 지역별 모집정보를 준비하고 있습니다.
        </div>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        <p>점수 통계는 본 서비스 참여자 기준이며 실제 응시자 전체의 합격선이 아닙니다.</p>
        <p>입력자 평균은 유효 표본 15명부터, 표본 1배수 지점은 유효 표본 30명 이상이면서 모집인원 이상일 때 공개합니다.</p>
        {data.latestRelease ? (
          <p className="mt-1">최신 발표: {data.latestRelease.releaseNumber}차 표본 집계 · {new Date(data.latestRelease.releasedAt).toLocaleString("ko-KR")}</p>
        ) : (
          <p className="mt-1">점수 정보는 관리자가 표본 집계를 발표한 뒤 표시됩니다.</p>
        )}
      </div>
    </section>
  );
}
