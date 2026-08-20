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
  examType?: string;
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
  writtenPassCount?: number;
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

/* 게이지는 아크와 바늘을 하나의 viewBox 안에서 같은 반지름 기준으로 그린다.
   차트 라이브러리에 아크를 맡기면 바늘 길이(컨테이너 높이 기준)와 아크 반지름
   (라이브러리 내부 계산)이 따로 놀아 화면 폭에 따라 바늘이 아크를 뚫고 나간다. */
const GAUGE_CENTER_X = 100;
const GAUGE_BASELINE_Y = 112;
const GAUGE_RING_RADIUS = 77;
const GAUGE_RING_THICKNESS = 30;
const GAUGE_NEEDLE_RADIUS = 64;
const GAUGE_SEGMENT_GAP = 2;
const GAUGE_SEGMENT_COLORS = [
  "var(--service-100)",
  "var(--service-200)",
  "var(--service-400)",
  "var(--service-700)",
];

function gaugePoint(angleDeg: number, radius: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: GAUGE_CENTER_X + radius * Math.cos(radians),
    y: GAUGE_BASELINE_Y - radius * Math.sin(radians),
  };
}

/* 상위 100%가 왼쪽(180°), 상위 0%가 오른쪽(0°)이다. */
function gaugeArcPaths(): Array<{ color: string; d: string }> {
  const span = 180 / GAUGE_SEGMENT_COLORS.length;
  return GAUGE_SEGMENT_COLORS.map((color, index) => {
    const isFirst = index === 0;
    const isLast = index === GAUGE_SEGMENT_COLORS.length - 1;
    const startAngle = 180 - index * span - (isFirst ? 0 : GAUGE_SEGMENT_GAP / 2);
    const endAngle = 180 - (index + 1) * span + (isLast ? 0 : GAUGE_SEGMENT_GAP / 2);
    const start = gaugePoint(startAngle, GAUGE_RING_RADIUS);
    const end = gaugePoint(endAngle, GAUGE_RING_RADIUS);
    return {
      color,
      d: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_RING_RADIUS} ${GAUGE_RING_RADIUS} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    };
  });
}

function getConfidenceLevel(stage: PredictionSummaryView["sampleStage"]): {
  label: string;
  message: string;
} {
  if (stage === "RELIABLE") {
    return {
      label: "신뢰 구간 진입",
      message: "표본 30% 이상이 입력되었습니다. 최종 결과를 보장하는 단계는 아닙니다.",
    };
  }
  if (stage === "FORMING") {
    return {
      label: "예측 윤곽 형성 중",
      message: "표본이 15% 이상 모였습니다. 후기 입력에 따라 순위가 변동될 수 있습니다.",
    };
  }
  if (stage === "COLLECTING") {
    return {
      label: "데이터 수집 중",
      message: "아직 참여자가 적어 순위 변동 가능성이 큽니다.",
    };
  }
  if (stage === "ESTIMATED") {
    return {
      label: "출원인원 확인 전",
      message: "출원인원 추정치로 계산 중이며 확실권은 표시하지 않습니다.",
    };
  }
  return {
    label: "초기 집계",
    message: "초기 데이터입니다. 참여자 수가 적어 순위가 크게 변동될 수 있습니다.",
  };
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
  const writtenPassCount = summary.writtenPassCount
    ?? Math.ceil(summary.recruitCount * summary.passMultiple);
  const confidence = getConfidenceLevel(summary.sampleStage);
  // Police explicitly sends gradeAvailability while the fire model predates that
  // calibration gate and exposes its own non-null predictionGrade. Keep the two
  // tenant policies independent: an omitted police-only gate must not hide fire grades.
  const gradesAvailable =
    summary.gradeAvailability === undefined
      ? summary.predictionGrade !== null
      : summary.gradeAvailability === "AVAILABLE";
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
          ? "bg-emerald-500"
          : level.key === "likely"
            ? "bg-sky-500"
            : level.key === "possible"
              ? "bg-amber-400"
              : "bg-slate-400";
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

  const samplePosition = sampleTopPercent === null
    ? null
    : Math.min(100, Math.max(0, sampleTopPercent));
  const needleAngle = samplePosition === null ? null : samplePosition * 1.8;
  const needleTip = needleAngle === null ? null : gaugePoint(needleAngle, GAUGE_NEEDLE_RADIUS);
  const arcPaths = gaugeArcPaths();

  return (
    <div className="w-full space-y-6">
      {/* 아래 섹션들과 같은 문서형 흐름을 쓴다. 여기만 카드로 감싸면 좌측 기준선이 어긋난다. */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xs font-semibold text-slate-500">{summary.examName}</span>
          <h1 className="user-page-title">
            {summary.examTypeLabel} - {summary.regionName} 실시간 분석
          </h1>
        </div>
        <time className="shrink-0 text-xs text-slate-500" dateTime={prediction.updatedAt}>
          최종 갱신 {formatUpdatedAt(prediction.updatedAt)}
        </time>
      </header>

      <section className="flex items-start gap-3">
        <Info className="mt-0.5 size-5 shrink-0 text-service-600" aria-hidden="true" />
        <div>
          <h2 className="user-card-title">
            {gradesAvailable ? `현재 예측 결과: ${summary.predictionGrade}` : "표본 순위를 중심으로 안내합니다"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {gradesAvailable ? confidence.message : reasonText}
          </p>
        </div>
      </section>

      {/* 회색 트레이 위에 흰 카드를 얹으면 흰-회색-흰 3중 표면이 된다.
          페이지의 다른 카드와 같은 테두리 한 겹으로 맞춘다. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="flex flex-col border border-slate-200 bg-white p-5">
          <p className="text-sm font-bold text-slate-500">내 표본 순위</p>
          {/* 옆 카드의 지표 수에 맞춰 늘어난 여백을 바닥에 몰지 않고 가운데로 흡수한다. */}
          <div className="flex flex-1 flex-col justify-center">
          <div className="mt-5 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <strong className="user-metric-hero text-slate-900">
                {summary.myRank.toLocaleString("ko-KR")}
              </strong>
              <span className="text-xl font-bold text-slate-500">등</span>
              <span className="text-sm text-slate-400">
                / {summary.totalParticipants.toLocaleString("ko-KR")}명
              </span>
            </div>
            <p className="mt-3 text-base font-bold text-service-700">
              {sampleTopPercent === null
                ? "유효 입력자 15명부터 백분위를 표시합니다"
                : `본 서비스 참여자 중 상위 ${sampleTopPercent.toFixed(1)}%`}
            </p>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>상위권</span>
              <span>전체 표본</span>
            </div>
            <div className="relative mt-3 h-2 bg-slate-200">
              {samplePosition === null ? null : (
                <span
                  className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-service-700 ring-4 ring-white"
                  style={{ left: `${Math.min(98, Math.max(2, samplePosition))}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="mt-4 text-center text-xs leading-5 text-slate-500">
              표본 안에서의 상대적 위치이며 실제 필기 합격선과는 다릅니다.
            </p>
          </div>

          </div>

          <dl className="flex items-center justify-between border-t border-slate-200 pt-5">
            <dt className="text-sm font-semibold text-slate-500">내 점수</dt>
            <dd className="text-xl font-extrabold text-slate-900 tabular-nums">
              {summary.myScore.toFixed(2)}점
            </dd>
          </dl>
        </article>

        <article className="flex flex-col border border-slate-200 bg-white p-5">
          <p className="text-sm font-bold text-slate-500">표본 내 위치</p>
          <div className="flex flex-1 flex-col justify-center">
          <div className="relative mx-auto mt-6 w-full max-w-[17rem]" aria-hidden="true">
            <svg viewBox="0 0 200 124" className="w-full">
              {arcPaths.map((segment) => (
                <path
                  key={segment.color}
                  d={segment.d}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={GAUGE_RING_THICKNESS}
                />
              ))}
              {needleTip === null ? null : (
                <g>
                  <line
                    x1={GAUGE_CENTER_X}
                    y1={GAUGE_BASELINE_Y}
                    x2={needleTip.x}
                    y2={needleTip.y}
                    stroke="#0a0a0a"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                  <circle cx={GAUGE_CENTER_X} cy={GAUGE_BASELINE_Y} r={7} fill="#0a0a0a" />
                </g>
              )}
            </svg>
            <span className="absolute bottom-0 left-0 text-[10px] font-semibold text-slate-500">상위 100%</span>
            <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[10px] font-semibold text-slate-500">상위 50%</span>
            <span className="absolute bottom-0 right-0 text-[10px] font-semibold text-service-700">상위 1%</span>
          </div>
          <div className="mt-5 text-center">
            <strong className="text-2xl font-extrabold tracking-tight text-slate-900">
              {sampleTopPercent === null ? "표본 축적 중" : `상위 ${sampleTopPercent.toFixed(1)}% 구간`}
            </strong>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              본 서비스의 동일 지역·채용유형 유효 입력자 기준입니다.
            </p>
            {gradesAvailable ? (
              <p className="mt-3 inline-flex min-h-8 items-center bg-service-50 px-3 text-sm font-bold text-service-800">
                현재 예측 결과: {summary.predictionGrade}
              </p>
            ) : null}
          </div>
          </div>
        </article>

        {/* 표본 신뢰도는 내 결과가 아니라 그 결과를 어디까지 믿을지에 대한 맥락이라
            같은 줄에서 성격을 구분한다. 카드 기하는 나머지 둘과 같게 둔다. */}
        <article className="flex flex-col border border-service-800 bg-service-800 p-5 text-white">
          <p className="text-sm font-bold text-service-100">표본 집계 상태</p>
          <div className="mt-5">
            <p className="text-sm font-semibold text-service-100">현재 표본 참여율</p>
            <strong className="user-metric-hero mt-2 block">
              {summary.sampleCoverageRate.toFixed(1)}%
            </strong>
            <div className="mt-5 h-2 bg-white/20">
              <div
                className="h-full bg-white transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.min(100, Math.max(0, summary.sampleCoverageRate))}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-service-100">
              참여율은 예측 정확도가 아니라 출원인원 대비 현재 표본의 축적 비율입니다.
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-2 border-y border-white/20">
            <div className="border-b border-r border-white/20 py-3 pr-3">
              <dt className="text-xs text-service-100">유효 입력자</dt>
              <dd className="mt-1 font-bold tabular-nums">
                {summary.totalParticipants.toLocaleString("ko-KR")}명
              </dd>
            </div>
            <div className="border-b border-white/20 py-3 pl-3">
              <dt className="text-xs text-service-100">모집인원</dt>
              <dd className="mt-1 font-bold tabular-nums">
                {summary.recruitCount.toLocaleString("ko-KR")}명
              </dd>
            </div>
            <div className="border-r border-white/20 py-3 pr-3">
              <dt className="text-xs text-service-100">출원인원</dt>
              <dd className="mt-1 font-bold tabular-nums">
                {summary.isApplicantCountExact ? `${totalApplicants.toLocaleString("ko-KR")}명` : "확인 전"}
              </dd>
            </div>
            <div className="py-3 pl-3">
              <dt className="text-xs text-service-100">경쟁률</dt>
              <dd className="mt-1 font-bold tabular-nums">
                {competitionRate === null ? "확인 전" : `${competitionRate.toFixed(1)} : 1`}
              </dd>
            </div>
          </dl>
          <div className="mt-auto border-l-2 border-white pl-3 pt-5">
            <p className="text-sm font-bold">{confidence.label}</p>
            <p className="mt-1 text-xs leading-5 text-service-100">{confidence.message}</p>
          </div>
        </article>
      </div>

      <section className="flex items-start gap-3 border-t border-slate-200 pt-5">
        <Target className="mt-0.5 size-5 shrink-0 text-service-600" aria-hidden="true" />
        <div className="text-sm text-slate-700">
          <p className="font-semibold">
            {summary.examType === "CAREER" && summary.recruitCount <= 5
              ? `${serviceName} 경행경채 필기 합격 예정 인원: ${writtenPassCount.toLocaleString("ko-KR")}명 (소수 모집 기준)`
              : `${serviceName} 필기 합격 예정 인원: 모집인원 × ${summary.passMultiple}배수, ${writtenPassCount.toLocaleString("ko-KR")}명`}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            실제 응시자 전체에 적용되는 제도 정보이며 현재 입력자 표본 순위와 직접 계산하지 않습니다.
          </p>
        </div>
      </section>

      {gradesAvailable ? (
        <section className="border-t border-slate-200 pt-6">
          <h2 className="user-card-title">참여자 합격예측 분포</h2>
          <div className="mt-4 flex h-8 w-full overflow-hidden bg-slate-100">
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
