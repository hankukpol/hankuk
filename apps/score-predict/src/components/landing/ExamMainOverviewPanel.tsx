"use client";

import { useEffect, useMemo, useState } from "react";
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

type ExamType = "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
type Gender = "MALE" | "FEMALE";
type ScoreDistributionKey = "TOTAL" | "FIRE_INTRO" | "FIRE_LAW" | "ADMIN_LAW" | "EMERGENCY";

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
    examYear: number;
    examRound: number;
    totalParticipants: number;
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
    sureMinScore: number;
    gap: number;
  }>;
  leastCompetitive: Array<{
    rank: number;
    label: string;
    averageFinalScore: number;
    sureMinScore: number;
    gap: number;
  }>;
  scoreDistributions: {
    PUBLIC: ScoreDistributionItem[];
    CAREER_RESCUE: ScoreDistributionItem[];
    CAREER_ACADEMIC: ScoreDistributionItem[];
    CAREER_EMT: ScoreDistributionItem[];
  };
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

function getExamTypeLabel(examType: ExamType): string {
  if (examType === "PUBLIC") return "공채";
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

function normalizePercent(value: number): number {
  return Number(value.toFixed(1));
}

const REGION_GRID_ORDER = [
  "강원",
  "경기남부",
  "경기북",
  "경남",
  "경북",
  "광주",
  "대구",
  "대전",
  "부산",
  "서울",
  "101경비단",
  "세종",
  "울산",
  "인천",
  "전남",
  "전북",
  "충남",
  "충북",
  "제주",
];

function getRegionDisplayOrder(regionName: string): number {
  const index = REGION_GRID_ORDER.findIndex((keyword) => regionName.includes(keyword));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function CompetitiveChart({
  title,
  data,
}: {
  title: string;
  data: Array<{
    rank: number;
    label: string;
    averageFinalScore: number;
    sureMinScore: number;
  }>;
}) {
  if (data.length < 1) {
    return (
      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-black text-slate-900">{title}</h4>
        <p className="mt-3 text-sm text-slate-500">표시할 데이터가 없습니다.</p>
      </article>
    );
  }

  return (
    <article className="rounded-md bg-slate-50 p-5">
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
              formatter={(value: unknown) => `${Number(value ?? 0).toFixed(2)}점`}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: "10px", color: "#64748b" }} iconType="circle" iconSize={8} />
            <Bar dataKey="averageFinalScore" name="실시간 입력자 평균" fill="#cbd5e1" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList dataKey="averageFinalScore" position="right" formatter={(v: unknown) => Number(v ?? 0).toFixed(2)} style={{ fontSize: "11px", fill: "#64748b", fontWeight: 600 }} />
            </Bar>
            <Bar dataKey="sureMinScore" name="합격확실권 점수" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList dataKey="sureMinScore" position="right" formatter={(v: unknown) => Number(v ?? 0).toFixed(2)} style={{ fontSize: "11px", fill: "#3b82f6", fontWeight: 600 }} />
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
    const rows = data?.rows ?? [];
    const hasPublic = rows.some((row) => row.examType === "PUBLIC");
    const hasCareerRescue = rows.some((row) => row.examType === "CAREER_RESCUE");
    const hasCareerAcademic = rows.some((row) => row.examType === "CAREER_ACADEMIC");
    const hasCareerEmt = rows.some((row) => row.examType === "CAREER_EMT");
    const careerEnabled = data?.careerExamEnabled ?? true;

    const next: ExamType[] = [];
    if (hasPublic) next.push("PUBLIC");
    if (careerEnabled && hasCareerRescue) next.push("CAREER_RESCUE");
    if (careerEnabled && hasCareerAcademic) next.push("CAREER_ACADEMIC");
    if (careerEnabled && hasCareerEmt) next.push("CAREER_EMT");

    return next.length > 0 ? next : ["PUBLIC"];
  }, [data?.careerExamEnabled, data?.rows]);

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
        const orderA = getRegionDisplayOrder(a.name);
        const orderB = getRegionDisplayOrder(b.name);
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, "ko-KR");
      });
  }, [rowsByExamType]);

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
    // 구조경채는 gender 없음, 나머지는 선택된 성별로 필터
    if (selectedExamType === "CAREER_RESCUE") return candidates[0] ?? null;
    return candidates.find((row) => row.gender === selectedGender) ?? null;
  }, [rowsByExamType, selectedRegionId, selectedExamType, selectedGender]);

  const isCollecting = selectedRow !== null && selectedRow.participantCount < 10;
  const isLowSample =
    selectedRow !== null &&
    !isCollecting &&
    selectedRow.participantCount < selectedRow.recruitCount;
  const applicantCountLabel = selectedRow
    ? selectedRow.applicantCount === null
      ? "응시인원(미입력)"
      : "응시인원"
    : "응시인원";

  const difficultySubjects = useMemo(() => {
    const original = data?.difficulty?.subjects ?? [];

    const mergedMap = new Map<string, DifficultySubject>();
    const others: DifficultySubject[] = [];

    original.forEach(sub => {
      // 소방학개론은 직렬(공채, 경채) 구분 없이 공통 과목으로 합산 처리
      if (sub.subjectName === "소방학개론") {
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
  }, [data?.difficulty?.subjects]);

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
    const base = rowsByExamType
      .filter((row) => row.participantCount >= 10 && row.averageFinalScore !== null && row.sureMinScore !== null)
      .map((row) => ({
        label: `${row.regionName}-${getExamTypeLabel(row.examType)}`,
        averageFinalScore: row.averageFinalScore as number,
        sureMinScore: row.sureMinScore as number,
        gap: (row.sureMinScore as number) - (row.averageFinalScore as number),
      }));

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
  }, [rowsByExamType]);

  if (isLoading) {
    return <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">풀서비스 메인 정보를 불러오는 중입니다...</section>;
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
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-5 sm:p-6 sm:pb-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-xl font-bold tracking-tight text-fire-600">
            {data.liveStats.examYear}.{String(data.liveStats.examRound).padStart(2, "0")} 시행
          </p>
          <p className="text-xs font-semibold text-slate-400">UPDATE {formatDateTime(data.updatedAt)}</p>
        </div>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">직렬별 실시간 합격예측 분석</h2>

        <div className="mt-6 inline-flex gap-1 rounded-md bg-slate-100 p-1">
          {availableExamTypes.map((examType) => {
            const active = selectedExamType === examType;
            return (
              <button
                key={examType}
                type="button"
                onClick={() => setSelectedExamType(examType)}
                className={`rounded-md px-6 py-2 text-sm font-bold transition ${active
                  ? "bg-white text-fire-600 border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                {getExamTypeLabel(examType)}
              </button>
            );
          })}
        </div>

        {/* 공채/소방학과/구급: 남녀 구분 탭 (별도 줄 표시) */}
        {selectedExamType !== "CAREER_RESCUE" && (
          <div className="mt-3 block">
          <div className="inline-flex gap-1 rounded-md bg-slate-100 p-1">
            {(["MALE", "FEMALE"] as const).map((g) => {
              const active = selectedGender === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGender(g)}
                  className={`rounded-md px-6 py-2 text-sm font-bold transition ${
                    active
                      ? "bg-white text-fire-600 border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {g === "MALE" ? "남" : "여"}
                </button>
              );
            })}
          </div>
          </div>
        )}

        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-bold text-slate-800">지역 선택</p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {regionOptions.map((region) => {
              const active = region.id === selectedRegionId;
              return (
                <button
                  key={region.id}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${active
                    ? "border-fire-600 bg-fire-600 text-white"
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

        <p className="mt-6 text-sm font-bold text-fire-600">
          {selectedRow ? `${getExamTypeLabel(selectedExamType)} : ${selectedRow.regionName}` : "지역을 선택해 주세요."}
        </p>

        <div className="mt-3 grid gap-4 xl:grid-cols-2 xl:items-stretch">
          <div className="h-full overflow-hidden rounded-md border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <tbody className="divide-y divide-slate-200">
                <tr className="divide-x divide-slate-200">
                  <th className="w-[140px] bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">
                    지역-직렬
                  </th>
                  <td className="px-4 py-3.5 font-bold text-slate-900">
                    {selectedRow ? `${selectedRow.regionName}-${getExamTypeLabel(selectedRow.examType)}` : "-"}
                  </td>
                </tr>
                <tr className="divide-x divide-slate-200">
                  <th className="w-[140px] bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">선발인원</th>
                  <td className="px-4 py-3.5 font-medium text-slate-700">
                    {selectedRow ? `${selectedRow.recruitCount.toLocaleString("ko-KR")}명` : "-"}
                  </td>
                </tr>
                <tr className="divide-x divide-slate-200">
                  <th className="w-[140px] bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">
                    {applicantCountLabel}
                  </th>
                  <td className="px-4 py-3.5 font-medium text-slate-700">
                    {selectedRow
                      ? selectedRow.applicantCount === null
                        ? "미입력"
                        : `${selectedRow.applicantCount.toLocaleString("ko-KR")}명`
                      : "-"}
                  </td>
                </tr>
                <tr className="divide-x divide-slate-200">
                  <th className="w-[140px] bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">경쟁률</th>
                  <td className="px-4 py-3.5 font-medium text-slate-700">
                    {selectedRow ? formatCompetition(selectedRow.competitionRate) : "-"}
                  </td>
                </tr>
                <tr className="divide-x divide-slate-200">
                  <th className="w-[140px] bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">
                    실시간 참여인원
                  </th>
                  <td className="px-4 py-3.5 font-medium text-slate-700">
                    {selectedRow
                      ? selectedRow.participantCount === 0
                        ? <span className="text-amber-600">데이터 수집 중</span>
                        : `${selectedRow.participantCount.toLocaleString("ko-KR")}명`
                      : "-"}
                  </td>
                </tr>
                <tr className="divide-x divide-slate-200">
                  <th className="w-[140px] bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">
                    실시간 평균점수
                    <span className="ml-1 text-xs font-normal text-slate-400">(과락 제외)</span>
                  </th>
                  <td className="px-4 py-3.5 font-bold text-fire-700">
                    {selectedRow
                      ? selectedRow.participantCount === 0
                        ? <span className="font-medium text-amber-600">데이터 수집 중</span>
                        : formatScore(selectedRow.averageFinalScore)
                      : "-"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex h-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
            {isLowSample && selectedRow ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                참여인원({selectedRow.participantCount.toLocaleString("ko-KR")}명)이 선발인원({selectedRow.recruitCount.toLocaleString("ko-KR")}명)보다 적어 예측 정확도가 낮습니다.
              </div>
            ) : null}
            <div className="flex-1">
              <table className="h-full w-full border-collapse text-sm">
                <tbody className="flex h-full flex-col divide-y divide-slate-200 border-b border-slate-200">
                  <tr className="flex flex-1 divide-x divide-slate-200">
                    <th className="flex w-[140px] items-center bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">합격가능권</th>
                    <td className="flex flex-1 items-center px-4 py-3.5 font-medium text-slate-700">
                      {selectedRow ? (isCollecting ? "데이터 수집 중" : formatRange(selectedRow.possibleRange)) : "-"}
                    </td>
                  </tr>
                  <tr className="flex flex-1 divide-x divide-slate-200">
                    <th className="flex w-[140px] items-center bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">합격유력권</th>
                    <td className="flex flex-1 items-center px-4 py-3.5 font-medium text-slate-700">
                      {selectedRow ? (isCollecting ? "데이터 수집 중" : formatRange(selectedRow.likelyRange)) : "-"}
                    </td>
                  </tr>
                  <tr className="flex flex-1 divide-x divide-slate-200">
                    <th className="flex w-[140px] items-center bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">합격확실권</th>
                    <td className="flex flex-1 items-center px-4 py-3.5 font-bold text-fire-700">
                      {selectedRow
                        ? isCollecting || selectedRow.sureMinScore === null
                          ? "데이터 수집 중"
                          : `${selectedRow.sureMinScore.toFixed(2)}점 이상`
                        : "-"}
                    </td>
                  </tr>
                  <tr className="flex flex-1 divide-x divide-slate-200">
                    <th className="flex w-[140px] items-center bg-slate-50 px-4 py-3.5 text-left font-bold text-slate-700 sm:w-[170px]">
                      1배수 컷 점수
                    </th>
                    <td className="flex flex-1 items-center px-4 py-3.5 font-medium text-slate-700">
                      {selectedRow
                        ? isCollecting || isLowSample || selectedRow.oneMultipleCutScore === null
                          ? "데이터 수집 중"
                          : formatScore(selectedRow.oneMultipleCutScore)
                        : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          * 2026 기준: 필기 합격예측 점수는 취업지원대상자/의사상자 가산점이 반영된 최종점수 기준이며, 자격증 가산점은
          별도 반영됩니다.
        </p>
      </section>
      ) : null}

      {sectionVisibility.difficulty ? (
      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-slate-900">
          과목별 체감난이도 <span className="text-fire-600">설문 결과</span>
        </h3>

        <div className="mt-5 rounded-md bg-slate-50 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-bold text-slate-700">
              과목 선택
              <select
                className="ml-3 h-10 min-w-[180px] rounded-md border border-slate-300 px-3 text-sm"
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
                    {subject.subjectName} {subject.subjectId < 0 ? "(공통)" : `(${getExamTypeLabel(subject.examType)})`}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-md bg-slate-800 px-5 py-2 text-center text-sm font-bold text-white">
              {difficultySubjects.find((item) => item.subjectId === difficultySubjectId)?.subjectName ?? "전체 과목 (평균)"}
            </div>
          </div>

          <div className="mt-8 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={difficultyChartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} dy={10} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                  formatter={(value: unknown) => `${Number(value ?? 0).toFixed(1)}%`}
                />
                <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  <LabelList dataKey="value" position="top" formatter={(v: unknown) => `${Number(v ?? 0).toFixed(1)}%`} style={{ fontSize: "12px", fill: "#64748b", fontWeight: 600 }} dy={-4} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      ) : null}

      {sectionVisibility.competitive ? (
      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-slate-900">실시간 최대/최소 경쟁 예상지역 TOP5</h3>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <CompetitiveChart title="실시간 최대 경쟁 예상지역 TOP5" data={competitiveRows.top} />
          <CompetitiveChart title="실시간 최소 경쟁 예상지역 TOP5" data={competitiveRows.least} />
        </div>
      </section>
      ) : null}

      {sectionVisibility.scoreDistribution ? (
      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-slate-900">채점자 성적분포도</h3>
        {scoreDistributionItems.length > 0 && selectedScoreDistribution ? (
          <div className="mt-5 rounded-md bg-slate-50 p-4 sm:p-6">
            <div className="flex flex-wrap gap-2">
              {scoreDistributionItems.map((item) => {
                const active = item.key === selectedScoreDistribution.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${active
                      ? "border-fire-700 bg-fire-700 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-700"
                      }`}
                    onClick={() => setSelectedScoreDistributionKey(item.key)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="rounded-full bg-white px-3 py-1">만점 {selectedScoreDistribution.maxScore}점</span>
              {selectedScoreDistribution.failThreshold !== null ? (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                  과락 {selectedScoreDistribution.failThreshold}점 미만
                </span>
              ) : null}
              <span className="rounded-full bg-white px-3 py-1">
                내 점수{" "}
                {selectedScoreDistribution.myScore === null
                  ? "-"
                  : `${selectedScoreDistribution.myScore.toFixed(1)}점`}
              </span>
              {selectedScoreDistribution.failThreshold !== null && selectedScoreDistribution.isFail !== null ? (
                <span
                  className={`rounded-full px-3 py-1 ${selectedScoreDistribution.isFail
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
                  <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                    formatter={(value: unknown) => `${Number(value ?? 0).toLocaleString("ko-KR")}명`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={42}>
                    {selectedScoreDistribution.buckets.map((bucket) => {
                      const color = bucket.isMine
                        ? "#1d4ed8"
                        : bucket.isFailRange
                          ? "#ef4444"
                          : "#0ea5e9";
                      return <Cell key={bucket.key} fill={color} />;
                    })}
                    <LabelList
                      dataKey="count"
                      position="top"
                      formatter={(value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")}
                      style={{ fontSize: "11px", fill: "#64748b", fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {selectedScoreDistribution.failThreshold !== null ? (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">빨강: 과락 구간</span>
              ) : null}
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">파랑: 내 위치</span>
              <span className="rounded-full bg-white px-3 py-1">
                {myScoreBucketLabel ? `내 위치 구간: ${myScoreBucketLabel}` : "내 점수 데이터 없음"}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">표시할 성적 분포 데이터가 없습니다.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}
