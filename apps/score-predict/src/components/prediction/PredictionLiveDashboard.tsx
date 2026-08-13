"use client";

import { Info, Target } from "lucide-react";
import { calculateSampleTopPercent } from "@/lib/public-sample-policy";

interface StatusData {
  label: string;
  ratio: string;
  count: number;
  percent: number;
  color: string;
  status: string;
}

interface PredictionSummaryView {
  examName: string;
  examTypeLabel: string;
  regionName: string;
  myScore: number;
  applicantCount: number | null;
  estimatedApplicants: number;
  isApplicantCountExact: boolean;
  totalParticipants: number;
  recruitCount: number;
  myMultiple: number | null;
  sampleTopPercent?: number | null;
  passMultiple: number;
  sureMultiple: number | null;
  likelyMultiple: number | null;
  sureMaxRank: number | null;
  likelyMaxRank: number | null;
  passCount: number | null;
  sampleCoverageRate: number;
  sampleStage: "INITIAL" | "COLLECTING" | "FORMING" | "RELIABLE" | "ESTIMATED";
  myRank: number;
  predictionGrade: string | null;
  gradeAvailability?: "AVAILABLE" | "UNAVAILABLE";
  unavailableReasons?: Array<
    "FEATURE_DISABLED" | "MISSING_APPLICANTS" | "INSUFFICIENT_SAMPLE" | "UNCALIBRATED"
  >;
}

interface PredictionPyramidLevel {
  key: "sure" | "likely" | "possible" | "challenge";
  label: string;
  count: number;
  minScore: number | null;
  maxMultiple: number | null;
  minMultiple: number | null;
}

interface PredictionDashboardPayload {
  summary: PredictionSummaryView;
  pyramid: {
    levels: PredictionPyramidLevel[];
  };
  updatedAt: string;
}

function getConfidenceLevel(stage: PredictionSummaryView["sampleStage"]): {
  label: string;
  message: string;
  className: string;
} {
  if (stage === "RELIABLE") {
    return {
      label: "신뢰 구간 진입",
      message: "표본 30% 이상이 입력되었습니다. 최종 결과를 보장하는 단계는 아닙니다.",
      className: "border-emerald-500 text-emerald-800",
    };
  }
  if (stage === "FORMING") {
    return {
      label: "예측 윤곽 형성 중",
      message: "표본이 15% 이상 모였습니다. 후기 입력에 따라 순위가 변동될 수 있습니다.",
      className: "border-service-500 text-service-800",
    };
  }
  if (stage === "COLLECTING") {
    return {
      label: "데이터 수집 중",
      message: "아직 참여자가 적어 순위 변동 가능성이 큽니다.",
      className: "border-amber-500 text-amber-800",
    };
  }
  if (stage === "ESTIMATED") {
    return {
      label: "출원인원 확인 전",
      message: "출원인원 추정치로 계산 중이며 확실권은 표시하지 않습니다.",
      className: "border-amber-500 text-amber-800",
    };
  }
  return {
    label: "초기 집계",
    message: "초기 데이터입니다. 참여자 수가 적어 순위가 크게 변동될 수 있습니다.",
    className: "border-amber-500 text-amber-800",
  };
}

function metricDivider(index: number): string {
  return `${index % 2 === 1 ? "border-l border-slate-200" : ""} ${
    index > 0 ? "lg:border-l lg:border-slate-200" : ""
  } ${index >= 2 ? "border-t border-slate-200 lg:border-t-0" : ""}`;
}

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function PredictionLiveDashboard({
  prediction,
  serviceName,
}: {
  prediction: PredictionDashboardPayload;
  serviceName: string;
}) {
  const { summary, pyramid } = prediction;
  const confidence = getConfidenceLevel(summary.sampleStage);
  const gradesAvailable = summary.gradeAvailability === "AVAILABLE";
  const sampleTopPercent = calculateSampleTopPercent(summary.myRank, summary.totalParticipants);
  const totalApplicants = summary.applicantCount ?? summary.estimatedApplicants;
  const competitionRate =
    summary.applicantCount !== null && summary.recruitCount > 0
      ? summary.applicantCount / summary.recruitCount
      : null;

  const statusData: StatusData[] = pyramid.levels
    .slice()
    .reverse()
    .map((level) => {
      const percent =
        summary.totalParticipants > 0 ? (level.count / summary.totalParticipants) * 100 : 0;
      const color =
        level.key === "sure"
          ? "bg-[var(--predict-safe)]"
          : level.key === "likely"
            ? "bg-[var(--predict-likely)]"
            : level.key === "possible"
              ? "bg-[var(--predict-possible)]"
              : "bg-[var(--predict-challenge)]";
      const status =
        level.minScore === null && level.count === 0
          ? "집계 중"
          : level.minScore === null
            ? "점수 하한 없음"
            : `${level.minScore.toFixed(2)}점 이상`;
      const ratio =
        level.maxMultiple === null
          ? `${level.minMultiple?.toFixed(2) ?? "-"}배 초과`
          : `${level.minMultiple === null ? "0.00" : level.minMultiple.toFixed(2)}~${level.maxMultiple.toFixed(2)}배`;
      return { label: level.label, ratio, count: level.count, percent, color, status };
    });
  const visibleStatusData = statusData.reduce<StatusData[]>((items, item) => {
    if (item.count > 0) items.push(item);
    return items;
  }, []);

  const reasonText = summary.unavailableReasons?.includes("MISSING_APPLICANTS")
    ? "출원인원이 확정되지 않았고 예측 모델의 실측 보정도 완료되지 않아 등급을 표시하지 않습니다."
    : summary.unavailableReasons?.includes("INSUFFICIENT_SAMPLE")
      ? "현재 표본으로는 합격 등급을 신뢰성 있게 산출할 수 없어 표본 내 순위만 제공합니다."
      : "지역별 실측 보정이 끝나기 전까지 합격 등급은 제공하지 않습니다.";

  const metrics = [
    { label: "내 점수", value: `${summary.myScore.toFixed(2)}점`, emphasized: false },
    { label: "표본 내 순위", value: `${summary.myRank}등`, emphasized: true },
    {
      label: "표본 내 위치",
      value: sampleTopPercent === null ? "표본 축적 중" : `상위 ${sampleTopPercent.toFixed(1)}%`,
      emphasized: false,
    },
    { label: "유효 입력자", value: `${summary.totalParticipants.toLocaleString("ko-KR")}명`, emphasized: false },
  ];

  const populationMetrics = [
    { label: "모집인원", value: `${summary.recruitCount.toLocaleString("ko-KR")}명` },
    {
      label: summary.isApplicantCountExact ? "출원인원" : "출원인원 추정",
      value: summary.isApplicantCountExact ? `${totalApplicants.toLocaleString("ko-KR")}명` : "미입력",
    },
    {
      label: "경쟁률",
      value: competitionRate === null ? "미입력" : `${competitionRate.toFixed(1)} : 1`,
    },
    { label: "표본 참여율", value: `${summary.sampleCoverageRate.toFixed(1)}%` },
  ];

  return (
    <div className="w-full space-y-6 font-sans">
      <header className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xs font-semibold text-slate-500">{summary.examName}</span>
          <h1 className="text-lg font-bold text-slate-900">
            {summary.examTypeLabel} - {summary.regionName} 실시간 분석
          </h1>
        </div>
        <time className="text-xs text-slate-500" dateTime={prediction.updatedAt}>
          최종 갱신 {formatUpdatedAt(prediction.updatedAt)}
        </time>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-start gap-3 px-5 py-5 sm:px-6">
          <Info className="mt-0.5 size-5 shrink-0 text-service-600" aria-hidden="true" />
          <div>
            <h2 className="font-bold text-slate-900">
              {gradesAvailable ? `현재 예측 결과: ${summary.predictionGrade}` : "표본 순위를 중심으로 안내합니다"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {gradesAvailable ? confidence.message : reasonText}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 border-t border-slate-200 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`px-5 py-4 ${metricDivider(index)} ${
 metric.emphasized ? "bg-service-50" : "bg-white"
 }`}
            >
              <dt className={`text-xs font-medium ${metric.emphasized ? "text-service-700" : "text-slate-500"}`}>
                {metric.label}
              </dt>
              <dd
                className={`mt-1 text-xl font-bold tabular-nums ${
 metric.emphasized ? "text-service-800" : "text-slate-900"
 }`}
              >
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-start gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <Target className="mt-0.5 size-5 shrink-0 text-service-600" aria-hidden="true" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold">
              {serviceName} 필기 합격자 선발 기준: 모집인원 × {summary.passMultiple.toFixed(0)}배수
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              실제 응시자 전체에 적용되는 제도 정보이며 현재 입력자 표본 순위와 직접 계산하지 않습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">모집 및 표본 정보</h2>
        <dl className="mt-4 grid grid-cols-2 border-y border-slate-200 lg:grid-cols-4">
          {populationMetrics.map((metric, index) => (
            <div key={metric.label} className={`px-4 py-3 ${metricDivider(index)}`}>
              <dt className="text-xs text-slate-500">{metric.label}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{metric.value}</dd>
            </div>
          ))}
        </dl>
        <div className={`mt-4 border-l-2 pl-4 text-sm ${confidence.className}`}>
          <p className="font-semibold">{confidence.label}</p>
          <p className="mt-1 leading-6 text-slate-600">{confidence.message}</p>
        </div>
      </section>

      {gradesAvailable ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">참여자 합격예측 분포</h2>
          <div className="mt-4 flex h-8 w-full overflow-hidden rounded-md bg-slate-100">
            {visibleStatusData.map((d) => (
                <div
                  key={d.label}
                  className={`flex h-full items-center justify-center ${d.color}`}
                  style={{ width: `${d.percent}%` }}
                  title={`${d.label} ${d.count}명 (${d.percent.toFixed(1)}%)`}
                >
                  {d.percent >= 12 ? (
                    <span className="text-xs font-semibold text-white">{d.count}명</span>
                  ) : null}
                </div>
            ))}
          </div>
          <ul className="data-list-flat mt-4 border-y border-slate-200">
            {statusData.map((item) => (
              <li
                key={item.label}
                className={`grid gap-2 px-3 py-3 text-sm sm:grid-cols-[7rem_8rem_8rem_1fr] sm:items-center ${
 item.label === summary.predictionGrade ? "bg-service-50" : "bg-white"
 }`}
              >
                <span className="font-semibold text-slate-900">{item.label}</span>
                <span className="text-slate-500">{item.status}</span>
                <span className="tabular-nums text-slate-600">{item.ratio}</span>
                <span className="text-right font-semibold tabular-nums text-slate-900">
                  {item.count}명 ({item.percent.toFixed(1)}%)
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-l-2 border-slate-300 pl-4 text-xs leading-5 text-slate-500">
            본 분포는 서비스 참여자 {summary.totalParticipants.toLocaleString("ko-KR")}명 기준이며 실제
            응시인원 전체의 성적 분포와 다를 수 있습니다.
          </p>
        </section>
      ) : null}
    </div>
  );
}
