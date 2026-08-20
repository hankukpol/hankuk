"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  canShowSampleAverage,
  canShowSampleOneMultiplePoint,
} from "@/lib/public-sample-policy";
import { getTenantRegionOrder } from "@/lib/tenant-regions";

/* 체감난이도는 순서가 있는 값이다. '무난함'을 중립에 두고 쉬움-어려움을 양방향으로 편다. */
const DIFFICULTY_SCALE = ["#0f766e", "#3f9e7c", "#a1a1aa", "#d97706", "#dc2626"];

type TenantType = "police" | "fire";
type ExamType = "PUBLIC" | "CAREER" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
type Gender = "MALE" | "FEMALE";
type ScoreDistributionKey = string;

interface ExamTypeOption {
  key: ExamType;
  label: string;
  requiresGender: boolean;
}

interface MainStatsRow {
  regionId: number;
  regionName: string;
  examType: ExamType;
  gender: Gender | null; // 구조경채: null, 나머지: MALE | FEMALE
  examTypeLabel: string;
  recruitCount: number;
  applicantCount: number | null;
  estimatedApplicants: number;
  isApplicantCountExact: boolean;
  competitionRate: number | null;
  participantCount: number;
  averageFinalScore: number | null;
  oneMultipleCutScore: number | null;
  oneMultipleBaseRank: number;
  oneMultipleActualRank: number | null;
  oneMultipleTieCount: number | null;
  possibleRange: { min: number | null; max: number | null };
  likelyRange: { min: number | null; max: number | null };
  sureMinScore: number | null;
}

interface DifficultySubject {
  subjectId: number;
  subjectName: string;
  examType: ExamType;
  responses: number;
  veryEasy: number;
  easy: number;
  normal: number;
  hard: number;
  veryHard: number;
}

interface DifficultyPayload {
  totalResponses: number;
  overall: {
    veryEasy: number;
    easy: number;
    normal: number;
    hard: number;
    veryHard: number;
  };
  subjects: DifficultySubject[];
}

interface ScoreDistributionBucket {
  key: string;
  label: string;
  min: number;
  max: number;
  count: number;
  isFailRange: boolean;
  isMine: boolean;
}

interface ScoreDistributionItem {
  key: ScoreDistributionKey;
  label: string;
  maxScore: number;
  failThreshold: number | null;
  myScore: number | null;
  isFail: boolean | null;
  buckets: ScoreDistributionBucket[];
}

interface MainStatsResponse {
  tenantType: TenantType;
  examTypes: ExamTypeOption[];
  updatedAt: string;
  careerExamEnabled: boolean;
  sectionVisibility: {
    overview: boolean;
    difficulty: boolean;
    competitive: boolean;
    scoreDistribution: boolean;
  };
  liveStats: {
    examName: string;
    examDate: string;
    examYear: number;
    examRound: number;
    totalParticipants: number;
    participantsByExamType: Partial<Record<ExamType, number>>;
    publicParticipants: number;
    careerRescueParticipants: number;
    careerAcademicParticipants: number;
    careerEmtParticipants: number;
    recentParticipants: number;
    updatedAt: string | null;
  } | null;
  notices: Array<{
    id: number;
    title: string;
    content: string;
  }>;
  difficulty: DifficultyPayload | null;
  rows: MainStatsRow[];
  topCompetitive: Array<{
    rank: number;
    label: string;
    averageFinalScore: number;
    referenceScore: number;
    referenceLabel: string;
    gap: number;
  }>;
  leastCompetitive: Array<{
    rank: number;
    label: string;
    averageFinalScore: number;
    referenceScore: number;
    referenceLabel: string;
    gap: number;
  }>;
  scoreDistributions: Partial<Record<ExamType, ScoreDistributionItem[]>>;
  refresh: {
    enabled: boolean;
    intervalSec: number;
  };
}

interface DifficultySummary {
  veryEasy: number;
  easy: number;
  normal: number;
  hard: number;
  veryHard: number;
}

function getExamTypeLabel(examType: ExamType, options: ExamTypeOption[] = []): string {
  const configured = options.find((option) => option.key === examType)?.label;
  if (configured) return configured;
  if (examType === "PUBLIC") return "공채";
  if (examType === "CAREER") return "경행경채";
  if (examType === "CAREER_RESCUE") return "구조 경채";
  if (examType === "CAREER_ACADEMIC") return "소방학과 경채";
  return "구급 경채";
}

function formatDateTime(value: string | null): string {
  if (!value) return "집계 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "집계 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatExamYearMonth(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시험일 미정";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}.${month.padStart(2, "0")}` : "시험일 미정";
}

function formatScore(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(2)}점`;
}

function formatRange(range: { min: number | null; max: number | null }): string {
  if (range.min === null || range.max === null) return "데이터 수집 중";
  return `${range.min.toFixed(2)}점 이하 ~ ${range.max.toFixed(2)}점 이상`;
}

function formatCompetition(value: number | null): string {
  if (value === null) return "미입력";
  return `${value.toFixed(2)} : 1`;
}

function OverviewMetricRow({
  label,
  value,
  emphasis = false,
}: {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="user-overview-metric-row grid grid-cols-2">
      <dt className="user-overview-metric-label">{label}</dt>
      <dd
        className={`user-overview-metric-value tabular-nums ${
          emphasis ? "text-service-700" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function normalizePercent(value: number): number {
  return Number(value.toFixed(1));
}

function CompetitiveChart({
  title,
  data,
  referenceLabel,
}: {
  title: string;
  data: Array<{
    rank: number;
    label: string;
    averageFinalScore: number;
    referenceScore: number;
  }>;
  referenceLabel: string;
}) {
  if (data.length < 1) {
    return (
      // 카드 안에서는 또 카드를 그리지 않는다. 데이터가 있을 때와 같은 배경 띠를 쓴다.
      <article className="rounded-lg bg-slate-50 p-5">
        <h4 className="user-data-label">{title}</h4>
        <p className="user-supporting-text mt-3 text-sm text-slate-500">표시할 데이터가 없습니다.</p>
      </article>
    );
  }

  return (
    <article className="rounded-lg bg-slate-50 p-5">
      <h4 className="user-data-label">{title}</h4>
      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e8e8ec" />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={104} tick={{ fontSize: "var(--user-chart-label-size)", fill: "#6b6b6b" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "#f3f3f5" }}
              contentStyle={{ borderRadius: "0", border: "1px solid #e8e8ec", fontSize: "var(--user-chart-label-size)" }}
              formatter={(value: unknown) => `${Number(value ?? 0).toFixed(2)}점`}
            />
            <Legend wrapperStyle={{ fontSize: "var(--user-chart-label-size)", paddingTop: "10px", color: "#6b6b6b" }} iconType="circle" iconSize={8} />
            <Bar dataKey="averageFinalScore" name="실시간 입력자 평균" fill="#cbd5e1" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList dataKey="averageFinalScore" position="right" formatter={(v: unknown) => Number(v ?? 0).toFixed(2)} style={{ fontSize: "var(--user-chart-label-size)", fill: "#6b6b6b", fontWeight: 600 }} />
            </Bar>
            <Bar dataKey="referenceScore" name={referenceLabel} fill="var(--service-600)" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList dataKey="referenceScore" position="right" formatter={(v: unknown) => Number(v ?? 0).toFixed(2)} style={{ fontSize: "var(--user-chart-label-size)", fill: "var(--service-600)", fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default function ExamMainOverviewPanel() {
  const [data, setData] = useState<MainStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [selectedExamType, setSelectedExamType] = useState<ExamType>("PUBLIC");
  const [selectedGender, setSelectedGender] = useState<Gender>("MALE");
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [difficultySubjectId, setDifficultySubjectId] = useState<number | null>(null);
  const [selectedScoreDistributionKey, setSelectedScoreDistributionKey] =
    useState<ScoreDistributionKey>("TOTAL");

  async function loadStats(showLoading: boolean) {
    if (showLoading) setIsLoading(true);

    try {
      const response = await fetch("/api/main-stats", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as MainStatsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "풀서비스 메인 통계 조회에 실패했습니다.");
      }
      setData(payload);
      setErrorMessage("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "풀서비스 메인 통계 조회에 실패했습니다.";
      setErrorMessage(message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStats(true);
  }, []);

  useEffect(() => {
    if (!data?.refresh?.enabled) return;
    const intervalMs = Math.max(10, data.refresh.intervalSec) * 1000;
    const timer = setInterval(() => {
      void loadStats(false);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [data?.refresh?.enabled, data?.refresh?.intervalSec]);

  const rowsByExamType = useMemo(
    () => (data?.rows ?? []).filter((row) => row.examType === selectedExamType),
    [data?.rows, selectedExamType]
  );

  const availableExamTypes = useMemo<ExamType[]>(() => {
    const configured = data?.examTypes.map((option) => option.key) ?? [];
    return configured.length > 0 ? configured : ["PUBLIC"];
  }, [data?.examTypes]);

  const selectedExamTypeOption = useMemo(
    () => data?.examTypes.find((option) => option.key === selectedExamType) ?? null,
    [data?.examTypes, selectedExamType]
  );

  useEffect(() => {
    if (!availableExamTypes.includes(selectedExamType)) {
      setSelectedExamType(availableExamTypes[0]);
    }
  }, [availableExamTypes, selectedExamType]);

  // 직렬 탭 변경 시 성별 초기화
  useEffect(() => {
    setSelectedGender("MALE");
  }, [selectedExamType]);

  const regionOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of rowsByExamType) {
      if (!map.has(row.regionId)) {
        map.set(row.regionId, row.regionName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const tenantType = data?.tenantType ?? "police";
        const orderA = getTenantRegionOrder(tenantType, a.name);
        const orderB = getTenantRegionOrder(tenantType, b.name);
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, "ko-KR");
      });
  }, [data?.tenantType, rowsByExamType]);

  useEffect(() => {
    if (regionOptions.length < 1) {
      setSelectedRegionId(null);
      return;
    }
    const exists = regionOptions.some((item) => item.id === selectedRegionId);
    if (!exists) {
      setSelectedRegionId(regionOptions[0].id);
    }
  }, [regionOptions, selectedRegionId]);

  const selectedRow = useMemo(() => {
    const candidates = rowsByExamType.filter((row) => row.regionId === selectedRegionId);
    if (candidates.length === 0) return null;
    if (!selectedExamTypeOption?.requiresGender) return candidates[0] ?? null;
    return candidates.find((row) => row.gender === selectedGender) ?? null;
  }, [rowsByExamType, selectedRegionId, selectedExamTypeOption?.requiresGender, selectedGender]);

  const isCollecting =
    selectedRow !== null && !canShowSampleAverage(selectedRow.participantCount);
  const isLowSample =
    selectedRow !== null &&
    !isCollecting &&
    !canShowSampleOneMultiplePoint(
      selectedRow.participantCount,
      selectedRow.recruitCount
    );
  const applicantCountLabel = selectedRow
    ? selectedRow.applicantCount === null
      ? "응시인원(미입력)"
      : "응시인원"
    : "응시인원";

  const difficultySubjects = useMemo(() => {
    const enabledExamTypeSet = new Set(data?.examTypes.map((option) => option.key) ?? []);
    const original = (data?.difficulty?.subjects ?? []).filter((subject) =>
      enabledExamTypeSet.has(subject.examType)
    );

    const mergedMap = new Map<string, DifficultySubject>();
    const others: DifficultySubject[] = [];

    original.forEach(sub => {
      // 소방학개론은 직렬(공채, 경채) 구분 없이 공통 과목으로 합산 처리
      if (data?.tenantType === "fire" && sub.subjectName === "소방학개론") {
        if (!mergedMap.has(sub.subjectName)) {
          mergedMap.set(sub.subjectName, {
            ...sub,
            subjectId: -100
          });
        } else {
          const existing = mergedMap.get(sub.subjectName)!;
          const totalResp = existing.responses + sub.responses;
          if (totalResp > 0) {
            existing.veryEasy = (existing.veryEasy * existing.responses + sub.veryEasy * sub.responses) / totalResp;
            existing.easy = (existing.easy * existing.responses + sub.easy * sub.responses) / totalResp;
            existing.normal = (existing.normal * existing.responses + sub.normal * sub.responses) / totalResp;
            existing.hard = (existing.hard * existing.responses + sub.hard * sub.responses) / totalResp;
            existing.veryHard = (existing.veryHard * existing.responses + sub.veryHard * sub.responses) / totalResp;
          }
          existing.responses = totalResp;
        }
      } else {
        others.push(sub);
      }
    });

    const mergedSubjects = Array.from(mergedMap.values());
    return [...others, ...mergedSubjects].sort((a, b) => b.subjectId - a.subjectId);
  }, [data?.difficulty?.subjects, data?.examTypes, data?.tenantType]);

  useEffect(() => {
    // difficultySubjectId가 null 이 아닐 때만 유효성 검증
    if (difficultySubjectId !== null) {
      const exists = difficultySubjects.some((subject) => subject.subjectId === difficultySubjectId);
      if (!exists) {
        setDifficultySubjectId(null);
      }
    }
  }, [difficultySubjects, difficultySubjectId]);

  const difficultySummary = useMemo((): DifficultySummary | null => {
    if (!data?.difficulty) return null;
    const selected = difficultySubjects.find((item) => item.subjectId === difficultySubjectId);
    if (selected) {
      return {
        veryEasy: normalizePercent(selected.veryEasy),
        easy: normalizePercent(selected.easy),
        normal: normalizePercent(selected.normal),
        hard: normalizePercent(selected.hard),
        veryHard: normalizePercent(selected.veryHard),
      };
    }
    return {
      veryEasy: normalizePercent(data.difficulty.overall.veryEasy),
      easy: normalizePercent(data.difficulty.overall.easy),
      normal: normalizePercent(data.difficulty.overall.normal),
      hard: normalizePercent(data.difficulty.overall.hard),
      veryHard: normalizePercent(data.difficulty.overall.veryHard),
    };
  }, [data?.difficulty, difficultySubjectId, difficultySubjects]);

  const difficultyChartData = useMemo(() => {
    if (!difficultySummary) return [];
    return [
      { label: "매우 쉬움", value: difficultySummary.veryEasy },
      { label: "다소 쉬움", value: difficultySummary.easy },
      { label: "무난함", value: difficultySummary.normal },
      { label: "다소 어려움", value: difficultySummary.hard },
      { label: "매우 어려움", value: difficultySummary.veryHard },
    ];
  }, [difficultySummary]);

  const scoreDistributionItems = useMemo(() => {
    if (!data) return [];
    return data.scoreDistributions[selectedExamType] ?? [];
  }, [data, selectedExamType]);

  useEffect(() => {
    if (scoreDistributionItems.length < 1) return;
    const exists = scoreDistributionItems.some(
      (item) => item.key === selectedScoreDistributionKey
    );
    if (!exists) {
      setSelectedScoreDistributionKey(scoreDistributionItems[0].key);
    }
  }, [scoreDistributionItems, selectedScoreDistributionKey]);

  const selectedScoreDistribution = useMemo(
    () =>
      scoreDistributionItems.find((item) => item.key === selectedScoreDistributionKey) ??
      scoreDistributionItems[0] ??
      null,
    [scoreDistributionItems, selectedScoreDistributionKey]
  );

  const myScoreBucketLabel = useMemo(
    () =>
      selectedScoreDistribution?.buckets.find((bucket) => bucket.isMine)?.label ?? null,
    [selectedScoreDistribution]
  );

  const competitiveRows = useMemo(() => {
    const isPolice = data?.tenantType === "police";
    const base = rowsByExamType
      .flatMap((row) => {
        if (
          row.averageFinalScore === null ||
          !canShowSampleAverage(row.participantCount)
        ) {
          return [];
        }

        const referenceScore = isPolice
          ? canShowSampleOneMultiplePoint(row.participantCount, row.recruitCount)
            ? row.oneMultipleCutScore
            : null
          : row.sureMinScore;
        if (referenceScore === null) return [];

        return [{
          label: `${row.regionName}-${row.examTypeLabel}`,
          averageFinalScore: row.averageFinalScore,
          referenceScore,
          gap: referenceScore - row.averageFinalScore,
        }];
      });

    const top = base
      .slice()
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item }));

    const least = base
      .slice()
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item }));

    return { top, least };
  }, [data?.tenantType, rowsByExamType]);

  if (isLoading) {
    return <section className="border-t border-slate-200 pt-6 text-sm text-slate-600">풀서비스 메인 정보를 불러오는 중입니다...</section>;
  }

  if (errorMessage && !data) {
    return <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{errorMessage}</section>;
  }

  if (!data?.liveStats) {
    return <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">현재 집계 가능한 시험 데이터가 없습니다.</section>;
  }

  const sectionVisibility = data.sectionVisibility ?? {
    overview: true,
    difficulty: true,
    competitive: true,
    scoreDistribution: true,
  };
  const hasVisibleSection =
    sectionVisibility.overview ||
    sectionVisibility.difficulty ||
    sectionVisibility.competitive ||
    sectionVisibility.scoreDistribution;

  return (
    <div className="space-y-5">
      {errorMessage ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </section>
      ) : null}

      {!hasVisibleSection ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          현재 관리자 설정에 의해 풀서비스 메인 카드가 모두 비활성화되어 있습니다.
        </section>
      ) : null}

      {sectionVisibility.overview ? (
      <section className="user-overview-card overflow-hidden border-t border-slate-200 pt-6 sm:pb-8 lg:pb-8 lg:pt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-xl font-bold tracking-tight text-service-600">
            {formatExamYearMonth(data.liveStats.examDate)} 시행
          </p>
          <p className="user-overview-caption text-xs font-semibold text-slate-500 lg:text-[13px]">최종 갱신 {formatDateTime(data.updatedAt)}</p>
        </div>
        <h2 className="user-overview-title mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl lg:text-[32px] lg:leading-[1.3]">직렬별 실시간 합격예측 분석</h2>

        {/* 채용유형은 시험 규칙 자체가 달라 내용이 통째로 바뀐다. 폴더형 탭으로 둔다. */}
        <div className="user-content-tabs mt-6" role="tablist" aria-label="채용유형 선택">
          {availableExamTypes.map((examType) => {
            const active = selectedExamType === examType;
            return (
              <button
                key={examType}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedExamType(examType)}
                className="user-content-tab"
              >
                {getExamTypeLabel(examType, data.examTypes)}
              </button>
            );
          })}
        </div>

        {selectedExamTypeOption?.requiresGender ? (
          <div className="mt-3 block">
          <div className="user-segmented-control inline-flex gap-1 bg-slate-100 p-1">
            {(["MALE", "FEMALE"] as const).map((g) => {
              const active = selectedGender === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGender(g)}
                  className={`user-segmented-control-item inline-flex h-9 items-center justify-center px-6 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-500 focus-visible:ring-offset-2 lg:text-[15px] ${
                    active
                      ? "border border-slate-200/50 bg-white text-service-600"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {g === "MALE" ? "남" : "여"}
                </button>
              );
            })}
          </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-lg bg-slate-50 p-4 sm:p-5 lg:p-6">
          <p className="user-data-label lg:text-base">지역 선택</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {regionOptions.map((region) => {
              const active = region.id === selectedRegionId;
              return (
                <button
                  key={region.id}
                  type="button"
                  className={`user-filter-button inline-flex h-11 w-full items-center justify-center border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-500 focus-visible:ring-offset-2 sm:w-auto sm:min-w-40 lg:text-base ${
                    active
                      ? "border-service-600 bg-service-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                  onClick={() => setSelectedRegionId(region.id)}
                >
                  {region.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-1 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="user-overview-section-title">
            {selectedRow ? `${selectedRow.regionName} ${selectedRow.examTypeLabel}` : "지역별 시험 현황"}
          </h3>
          <p className="user-overview-caption text-xs text-slate-500 lg:text-[13px]">본 서비스 참여자 기준으로 집계합니다.</p>
        </div>

        {/* 두 표는 서로 다른 정보다. 공용 테두리로 붙이지 않고 간격으로 분리한다. */}
        <div className="mt-4 lg:grid lg:grid-cols-2 lg:gap-6">
          <section aria-labelledby="exam-overview-heading">
            <h4
              id="exam-overview-heading"
              className="user-overview-table-heading flex items-center border-b border-slate-200 text-slate-800 sm:px-5 lg:min-h-[52px] lg:px-6 lg:text-[15px]"
            >
              시험 현황
            </h4>
            <dl className="divide-y divide-slate-200">
              <OverviewMetricRow
                label="지역·직렬"
                value={selectedRow ? `${selectedRow.regionName}·${selectedRow.examTypeLabel}` : "-"}
              />
              <OverviewMetricRow
                label="선발인원"
                value={selectedRow ? `${selectedRow.recruitCount.toLocaleString("ko-KR")}명` : "-"}
              />
              <OverviewMetricRow
                label={applicantCountLabel}
                value={
                  selectedRow
                    ? selectedRow.applicantCount === null
                      ? "미입력"
                      : `${selectedRow.applicantCount.toLocaleString("ko-KR")}명`
                    : "-"
                }
              />
              <OverviewMetricRow
                label="경쟁률"
                value={selectedRow ? formatCompetition(selectedRow.competitionRate) : "-"}
              />
              <OverviewMetricRow
                label="실시간 참여인원"
                value={
                  selectedRow
                    ? selectedRow.participantCount === 0
                      ? <span className="font-medium text-slate-500">데이터 수집 중</span>
                      : `${selectedRow.participantCount.toLocaleString("ko-KR")}명`
                    : "-"
                }
              />
            </dl>
          </section>

          <section className="mt-6 lg:mt-0" aria-labelledby="sample-metrics-heading">
            <h4
              id="sample-metrics-heading"
              className="user-overview-table-heading flex items-center border-b border-slate-200 text-slate-800 sm:px-5 lg:min-h-[52px] lg:px-6 lg:text-[15px]"
            >
              표본 지표
            </h4>
            <dl className="divide-y divide-slate-200">
              <OverviewMetricRow
                label={
                  <>
                    실시간 평균점수
                    <span className="user-overview-caption ml-1 whitespace-nowrap text-xs font-normal text-slate-400">(과락 제외)</span>
                  </>
                }
                value={
                  selectedRow
                    ? selectedRow.participantCount === 0
                      ? <span className="font-medium text-slate-500">데이터 수집 중</span>
                      : formatScore(selectedRow.averageFinalScore)
                    : "-"
                }
                emphasis
              />
              <OverviewMetricRow
                label="1배수 컷 점수"
                value={
                  selectedRow
                    ? isCollecting || isLowSample || selectedRow.oneMultipleCutScore === null
                      ? <span className="font-medium text-slate-500">데이터 수집 중</span>
                      : formatScore(selectedRow.oneMultipleCutScore)
                    : "-"
                }
                emphasis
              />
              <OverviewMetricRow
                label="합격가능권"
                value={
                  selectedRow
                    ? isCollecting
                      ? <span className="font-medium text-slate-500">데이터 수집 중</span>
                      : formatRange(selectedRow.possibleRange)
                    : "-"
                }
              />
              <OverviewMetricRow
                label="합격유력권"
                value={
                  selectedRow
                    ? isCollecting
                      ? <span className="font-medium text-slate-500">데이터 수집 중</span>
                      : formatRange(selectedRow.likelyRange)
                    : "-"
                }
              />
              <OverviewMetricRow
                label="합격확실권"
                value={
                  selectedRow
                    ? isCollecting || selectedRow.sureMinScore === null
                      ? <span className="font-medium text-slate-500">데이터 수집 중</span>
                      : `${selectedRow.sureMinScore.toFixed(2)}점 이상`
                    : "-"
                }
                emphasis
              />
            </dl>
          </section>
        </div>

        {isLowSample && selectedRow ? (
          <p className="mt-3 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            참여인원({selectedRow.participantCount.toLocaleString("ko-KR")}명)이 선발인원({selectedRow.recruitCount.toLocaleString("ko-KR")}명)보다 적어 예측 정확도가 낮습니다.
          </p>
        ) : null}
        <p className="user-overview-caption mt-2 text-xs text-slate-500 lg:text-[13px]">
          * 2026 기준: 필기 합격예측 점수는 취업지원대상자/의사상자 가산점이 반영된 최종점수 기준이며, 자격증 가산점은
          별도 반영됩니다.
        </p>
      </section>
      ) : null}

      {sectionVisibility.difficulty ? (
      <section className="border-t border-slate-200 pt-6">
        <h3 className="user-overview-section-title">
          과목별 체감난이도 <span className="text-service-600">설문 결과</span>
        </h3>

        <div className="mt-5 rounded-md bg-slate-50 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-bold text-slate-700">
              과목 선택
              <select
                className="ml-3 h-11 min-w-[180px] rounded-md border border-slate-300 px-3 text-sm"
                value={difficultySubjectId ?? ""}
                onChange={(event) => {
                  const val = event.target.value;
                  if (val === "") {
                    setDifficultySubjectId(null);
                  } else {
                    const next = Number(val);
                    setDifficultySubjectId(Number.isFinite(next) ? next : null);
                  }
                }}
              >
                <option value="">전체 과목 (평균)</option>
                {difficultySubjects.map((subject) => (
                  <option key={subject.subjectId} value={subject.subjectId}>
                    {subject.subjectName} {subject.subjectId < 0 ? "(공통)" : `(${getExamTypeLabel(subject.examType, data.examTypes)})`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-8 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={difficultyChartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#e8e8ec" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: "var(--user-chart-label-size)", fill: "#6b6b6b" }} axisLine={false} tickLine={false} dy={10} />
                <YAxis domain={[0, (dataMax: number) => Math.min(100, Math.max(20, Math.ceil((dataMax + 8) / 10) * 10))]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: "var(--user-chart-label-size)", fill: "#9c9c9c" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#f3f3f5" }}
                  contentStyle={{ borderRadius: "0", border: "1px solid #e8e8ec", fontSize: "var(--user-chart-label-size)" }}
                  formatter={(value: unknown) => [`${Number(value ?? 0).toFixed(1)}%`, "응답 비율"]}
                />
                <Bar dataKey="value" name="응답 비율" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {difficultyChartData.map((entry, index) => (
                    <Cell key={entry.label} fill={DIFFICULTY_SCALE[index] ?? "var(--service-500)"} />
                  ))}
                  <LabelList dataKey="value" position="top" formatter={(v: unknown) => `${Number(v ?? 0).toFixed(1)}%`} style={{ fontSize: "var(--user-chart-label-size)", fill: "#6b6b6b", fontWeight: 600 }} dy={-4} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      ) : null}

      {sectionVisibility.competitive ? (
      <section className="border-t border-slate-200 pt-6">
        <h3 className="user-overview-section-title">실시간 최대/최소 경쟁 예상지역 TOP5</h3>
        <p className="user-overview-caption mt-2 text-sm text-slate-500">
          본 서비스 참여자의 입력자 평균과 {data.tenantType === "police" ? "표본 1배수 지점" : "합격확실권 점수"} 간 점수 차이를 비교합니다.
        </p>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <CompetitiveChart
            title="실시간 최대 경쟁 예상지역 TOP5"
            data={competitiveRows.top}
            referenceLabel={data.tenantType === "police" ? "표본 1배수 지점" : "합격확실권 점수"}
          />
          <CompetitiveChart
            title="실시간 최소 경쟁 예상지역 TOP5"
            data={competitiveRows.least}
            referenceLabel={data.tenantType === "police" ? "표본 1배수 지점" : "합격확실권 점수"}
          />
        </div>
      </section>
      ) : null}

      {sectionVisibility.scoreDistribution ? (
      <section className="border-t border-slate-200 pt-6">
        <h3 className="user-overview-section-title">채점자 성적분포도</h3>
        {scoreDistributionItems.length > 0 && selectedScoreDistribution ? (
          <div className="mt-5 rounded-md bg-slate-50 p-4 sm:p-6">
            <div className="flex flex-wrap border-b border-slate-200">
              {scoreDistributionItems.map((item) => {
                const active = item.key === selectedScoreDistribution.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="user-filter-tab -mb-px"
                    data-active={active}
                    onClick={() => setSelectedScoreDistributionKey(item.key)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="bg-white px-3 py-1">만점 {selectedScoreDistribution.maxScore}점</span>
              {selectedScoreDistribution.failThreshold !== null ? (
                <span className="bg-rose-100 px-3 py-1 text-rose-700">
                  과락 {selectedScoreDistribution.failThreshold}점 미만
                </span>
              ) : null}
              <span className="bg-white px-3 py-1">
                내 점수{" "}
                {selectedScoreDistribution.myScore === null
                  ? "-"
                  : `${selectedScoreDistribution.myScore.toFixed(1)}점`}
              </span>
              {selectedScoreDistribution.failThreshold !== null && selectedScoreDistribution.isFail !== null ? (
                <span
                  className={`px-3 py-1 ${selectedScoreDistribution.isFail
 ? "bg-rose-100 text-rose-700"
 : "bg-emerald-100 text-emerald-700"
 }`}
                >
                  {selectedScoreDistribution.isFail ? "내 상태: 과락" : "내 상태: 통과"}
                </span>
              ) : null}
            </div>

            <div className="mt-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={selectedScoreDistribution.buckets}
                  margin={{ top: 16, right: 8, left: -12, bottom: 8 }}
                >
                  <CartesianGrid stroke="#e8e8ec" vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: "var(--user-chart-label-size)", fill: "#6b6b6b" }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: "var(--user-chart-label-size)", fill: "#9c9c9c" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0", border: "1px solid #e8e8ec", fontSize: "var(--user-chart-label-size)" }}
                    formatter={(value: unknown) => [`${Number(value ?? 0).toLocaleString("ko-KR")}명`, "채점자 수"]}
                  />
                  <Bar dataKey="count" name="채점자 수" radius={[4, 4, 0, 0]} maxBarSize={42}>
                    {selectedScoreDistribution.buckets.map((bucket) => {
                      // 내 구간은 서비스색, 불합격 구간은 경고색, 나머지는 중립.
                      // 서비스색이 빨강인 소방에서도 구간이 서로 뭉개지지 않는 조합이다.
                      const color = bucket.isMine
                        ? "var(--service-700)"
                        : bucket.isFailRange
                          ? "#d97706"
                          : "#cbd5e1";
                      return <Cell key={bucket.key} fill={color} />;
                    })}
                    <LabelList
                      dataKey="count"
                      position="top"
                      formatter={(value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")}
                      style={{ fontSize: "var(--user-chart-label-size)", fill: "#6b6b6b", fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {selectedScoreDistribution.failThreshold !== null ? (
                <span className="bg-rose-100 px-3 py-1 text-rose-700">빨강: 과락 구간</span>
              ) : null}
              <span className="bg-blue-100 px-3 py-1 text-blue-700">파랑: 내 위치</span>
              <span className="bg-white px-3 py-1">
                {myScoreBucketLabel ? `내 위치 구간: ${myScoreBucketLabel}` : "내 점수 데이터 없음"}
              </span>
            </div>
          </div>
        ) : (
          <p className="user-overview-caption mt-3 text-sm text-slate-500">표시할 성적 분포 데이터가 없습니다.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}
