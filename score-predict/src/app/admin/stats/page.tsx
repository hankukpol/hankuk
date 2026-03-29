"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";

const ADMIN_EXAM_API = "/api/admin/exam?feature=stats";
const STATS_API = "/api/stats";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  isActive: boolean;
}

interface RegionStat {
  regionId: number;
  regionName: string;
  publicCount: number;
  careerRescueCount: number;
  careerAcademicCount: number;
  careerEmtCount: number;
  total: number;
  avgTotalScore: number;
  avgFinalScore: number;
}

type PredictionExamType = "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
type DifficultyLabel = "매우 쉬움" | "쉬움" | "보통" | "어려움" | "매우 어려움";

interface RegionPredictionStat {
  regionId: number;
  regionName: string;
  examType: PredictionExamType;
  recruitCount: number;
  participantCount: number;
  oneMultipleBaseRank: number;
  isOneMultipleCutConfirmed: boolean;
  oneMultipleActualRank: number | null;
  oneMultipleCutScore: number | null;
  oneMultipleTieCount: number | null;
}

interface DateStat {
  date: string;
  count: number;
}

interface ScoreDistributionItem {
  bucket: number;
  label: string;
  start: number;
  end: number;
  count: number;
  isCutoffRange: boolean;
}

interface DifficultySubjectStat {
  subjectId: number;
  subjectName: string;
  examType: PredictionExamType;
  responses: number;
  veryEasy: number;
  easy: number;
  normal: number;
  hard: number;
  veryHard: number;
  easyCombined: number;
  hardCombined: number;
  dominantLabel: DifficultyLabel;
}

interface DifficultyStatSummary {
  examId: number;
  examName: string;
  totalResponses: number;
  overall: {
    veryEasy: number;
    easy: number;
    normal: number;
    hard: number;
    veryHard: number;
    easyCombined: number;
    hardCombined: number;
    dominantLabel: DifficultyLabel;
  };
  subjects: DifficultySubjectStat[];
}

interface StatsResponse {
  exam: {
    id: number;
    name: string;
    year: number;
    round: number;
    examDate: string;
    isActive: boolean;
  };
  totalParticipants: number;
  byExamType: {
    PUBLIC: number;
    CAREER_RESCUE: number;
    CAREER_ACADEMIC: number;
    CAREER_EMT: number;
  };
  byGender: {
    MALE: number;
    FEMALE: number;
  };
  byRegion: RegionStat[];
  byRegionPrediction: RegionPredictionStat[];
  submissionsByDate: DateStat[];
  scoreDistribution: ScoreDistributionItem[];
  difficulty: DifficultyStatSummary | null;
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

function formatDate(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
}

function formatScore(value: number): string {
  return value.toFixed(1);
}

function formatNullableScore(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(2);
}

function formatPredictionScore(value: number | null, isConfirmed: boolean): string {
  if (!isConfirmed) return "데이터 수집 중";
  return formatNullableScore(value);
}

function formatPredictionRank(value: number | null, isConfirmed: boolean): string {
  if (!isConfirmed) return "데이터 수집 중";
  if (value === null) return "-";
  return `${value.toLocaleString("ko-KR")}등`;
}

function formatPredictionTieCount(value: number | null, isConfirmed: boolean): string {
  if (!isConfirmed) return "데이터 수집 중";
  if (value === null) return "-";
  return `${value.toLocaleString("ko-KR")}명`;
}

function formatPredictionExamType(type: PredictionExamType): string {
  if (type === "PUBLIC") return "공채";
  if (type === "CAREER_RESCUE") return "구조 경채";
  if (type === "CAREER_ACADEMIC") return "학과 경채";
  return "구급 경채";
}

function escapeCsvCell(value: string | number): string {
  const raw = String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

async function readResponseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function buildStatsCsvContent(stats: StatsResponse): string {
  const lines: string[] = [];
  lines.push("구분,항목,값");
  lines.push(["시험", "시험명", stats.exam.name].map(escapeCsvCell).join(","));
  lines.push(["시험", "시험차수", `${stats.exam.year}년 ${stats.exam.round}차`].map(escapeCsvCell).join(","));
  lines.push(["참여현황", "총 참여자", stats.totalParticipants].map(escapeCsvCell).join(","));
  lines.push(["참여현황", "공채", stats.byExamType.PUBLIC].map(escapeCsvCell).join(","));
  lines.push(["참여현황", "구조 경채", stats.byExamType.CAREER_RESCUE].map(escapeCsvCell).join(","));
  lines.push(["참여현황", "학과 경채", stats.byExamType.CAREER_ACADEMIC].map(escapeCsvCell).join(","));
  lines.push(["참여현황", "구급 경채", stats.byExamType.CAREER_EMT].map(escapeCsvCell).join(","));
  lines.push(["성별", "남성", stats.byGender.MALE].map(escapeCsvCell).join(","));
  lines.push(["성별", "여성", stats.byGender.FEMALE].map(escapeCsvCell).join(","));
  lines.push("");
  lines.push("지역별 통계,,,,,,,");
  lines.push("지역,공채,구조 경채,학과 경채,구급 경채,합계,평균 원점수,평균 최종점수");
  for (const row of stats.byRegion) {
    lines.push(
      [
        row.regionName,
        row.publicCount,
        row.careerRescueCount,
        row.careerAcademicCount,
        row.careerEmtCount,
        row.total,
        formatScore(row.avgTotalScore),
        formatScore(row.avgFinalScore),
      ].map(escapeCsvCell).join(",")
    );
  }
  lines.push("");
  lines.push("1배수 도달 지표(합격예측),,,,,,");
  lines.push("지역,채용유형,참여인원,모집인원(1배수 기준),1배수 컷 점수,실제 1배수 석등,1배수 동점 인원");
  for (const row of stats.byRegionPrediction) {
    lines.push(
      [
        row.regionName,
        formatPredictionExamType(row.examType),
        row.participantCount,
        row.oneMultipleBaseRank,
        formatPredictionScore(row.oneMultipleCutScore, row.isOneMultipleCutConfirmed),
        formatPredictionRank(row.oneMultipleActualRank, row.isOneMultipleCutConfirmed),
        formatPredictionTieCount(row.oneMultipleTieCount, row.isOneMultipleCutConfirmed),
      ].map(escapeCsvCell).join(",")
    );
  }
  lines.push("");
  lines.push("일자별 제출 추이,,");
  lines.push("일자,제출 건수");
  for (const row of stats.submissionsByDate) lines.push([row.date, row.count].map(escapeCsvCell).join(","));
  lines.push("");
  lines.push("점수 분포,,");
  lines.push("점수 구간,인원 수");
  for (const row of stats.scoreDistribution) lines.push([row.label, row.count].map(escapeCsvCell).join(","));
  lines.push("");
  lines.push("체감 난이도,,,,,");
  lines.push("과목,응답 수,쉬움(%),보통(%),어려움(%),우세");
  if (stats.difficulty?.subjects?.length) {
    for (const row of stats.difficulty.subjects) {
      const name =
        row.examType === "CAREER_RESCUE"
          ? `${row.subjectName}(구조 경채)`
          : row.examType === "CAREER_ACADEMIC"
            ? `${row.subjectName}(학과 경채)`
            : row.examType === "CAREER_EMT"
              ? `${row.subjectName}(구급 경채)`
              : row.subjectName;
      lines.push([name, row.responses, row.easy, row.normal, row.hard, row.dominantLabel].map(escapeCsvCell).join(","));
    }
  }
  return lines.join("\r\n");
}

export default function AdminStatsPage() {
  const { enabled: statsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("stats");
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [selectedPredictionExamType, setSelectedPredictionExamType] =
    useState<PredictionExamType>("PUBLIC");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  const recentDateStats = useMemo(() => {
    if (!stats?.submissionsByDate) return [];
    return [...stats.submissionsByDate].slice(-14);
  }, [stats]);

  const availablePredictionExamTypes = useMemo<PredictionExamType[]>(() => {
    const rows = stats?.byRegionPrediction ?? [];
    const next: PredictionExamType[] = [];
    if (rows.some((item) => item.examType === "PUBLIC")) next.push("PUBLIC");
    if (rows.some((item) => item.examType === "CAREER_RESCUE")) next.push("CAREER_RESCUE");
    if (rows.some((item) => item.examType === "CAREER_ACADEMIC")) next.push("CAREER_ACADEMIC");
    if (rows.some((item) => item.examType === "CAREER_EMT")) next.push("CAREER_EMT");
    return next.length > 0 ? next : ["PUBLIC"];
  }, [stats?.byRegionPrediction]);

  useEffect(() => {
    if (!availablePredictionExamTypes.includes(selectedPredictionExamType)) {
      setSelectedPredictionExamType(availablePredictionExamTypes[0]);
    }
  }, [availablePredictionExamTypes, selectedPredictionExamType]);

  const predictionRowsByExamType = useMemo(
    () =>
      (stats?.byRegionPrediction ?? [])
        .filter((item) => item.examType === selectedPredictionExamType)
        .sort((a, b) => a.regionName.localeCompare(b.regionName, "ko-KR")),
    [selectedPredictionExamType, stats?.byRegionPrediction]
  );

  const loadExamOptions = useCallback(async () => {
    const response = await fetch(ADMIN_EXAM_API, { method: "GET", cache: "no-store" });
    const data = await readResponseJson<{ exams?: ExamItem[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? `시험 목록을 불러오지 못했습니다. (${response.status})`);
    }

    const examList = data?.exams ?? [];
    setExams(examList);

    setSelectedExamId((current) => {
      if (current || examList.length === 0) return current;
      const activeExam = examList.find((exam) => exam.isActive) ?? examList[0];
      return activeExam.id;
    });
  }, []);

  const loadStats = useCallback(async (examId: number) => {
    const response = await fetch(`${STATS_API}?examId=${examId}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<(StatsResponse & { error?: string }) | null>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? `참여 통계 조회에 실패했습니다. (${response.status})`);
    }
    if (!data) {
      throw new Error("참여 통계 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요.");
    }
    setStats(data);
  }, []);

  useEffect(() => {
    if (isFeatureLoading) return;
    if (!statsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadExamOptions();
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "시험 목록 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, loadExamOptions, statsEnabled]);

  useEffect(() => {
    if (isFeatureLoading || !statsEnabled || !selectedExamId) return;

    void (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadStats(selectedExamId);
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "참여 통계 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, loadStats, selectedExamId, statsEnabled]);

  if (isFeatureLoading || (statsEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">참여 통계 페이지를 불러오는 중입니다...</p>;
  }

  if (!statsEnabled) {
    return <AdminFeatureDisabledState feature="stats" />;
  }

  function handleDownloadCsv() {
    if (!stats) {
      setNotice({ type: "error", message: "다운로드할 통계 데이터가 없습니다." });
      return;
    }

    setIsDownloadingCsv(true);
    try {
      const csvContent = buildStatsCsvContent(stats);
      const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const today = new Date();
      const dateText = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
        today.getDate()
      ).padStart(2, "0")}`;
      const safeExamName = stats.exam.name.replace(/[\\/:*?"<>|]/g, "_");
      anchor.href = url;
      anchor.download = `합격예측_참여통계_${safeExamName}_${dateText}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice({ type: "success", message: "CSV 파일 다운로드가 시작되었습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "CSV 다운로드 중 오류가 발생했습니다.",
      });
    } finally {
      setIsDownloadingCsv(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">참여 통계</h1>
            <p className="mt-1 text-sm text-slate-600">
              시험별 참여 현황을 유형, 성별, 지역 기준으로 확인합니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadCsv}
            disabled={!stats || isDownloadingCsv}
          >
            {isDownloadingCsv ? "CSV 생성 중..." : "CSV 다운로드"}
          </Button>
        </header>

        <section className="space-y-2">
          <label htmlFor="exam-select" className="text-sm font-medium text-slate-700">
            시험 선택
          </label>
          <select
            id="exam-select"
            className="h-9 w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={selectedExamId ?? ""}
            onChange={(event) => setSelectedExamId(Number(event.target.value))}
            disabled={isLoading || exams.length === 0}
          >
            {exams.length === 0 ? <option value="">시험 없음</option> : null}
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.year}년 {exam.round}차 - {exam.name}
              </option>
            ))}
          </select>
        </section>

        {notice ? (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              notice.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-slate-600">통계를 불러오는 중입니다...</p>
        ) : !stats ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
            표시할 통계가 없습니다.
          </p>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  총 참여자
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats.totalParticipants}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  공채
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats.byExamType.PUBLIC}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  구조 경채
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats.byExamType.CAREER_RESCUE}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  학과 경채
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats.byExamType.CAREER_ACADEMIC}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  구급 경채
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stats.byExamType.CAREER_EMT}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  시험일
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatDate(stats.exam.examDate)}
                </p>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-900">일자별 제출 추이</h2>
                <div className="mt-3 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={recentDateStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  {recentDateStats.length === 0 ? (
                    <p>최근 제출 데이터가 없습니다.</p>
                  ) : (
                    recentDateStats.map((item) => (
                      <div key={item.date} className="flex items-center justify-between">
                        <span>{item.date}</span>
                        <span className="font-semibold text-slate-900">{item.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  점수 분포 히스토그램(최종점수 기준)
                </h2>
                <div className="mt-3 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count">
                        {stats.scoreDistribution.map((item) => (
                          <Cell
                            key={`score-bin-${item.bucket}`}
                            fill={item.isCutoffRange ? "#ef4444" : "#2563eb"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  합격 구간(100등 미만)은 빨간색으로 표시합니다.
                </p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-900">성별 참여</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-600">남성</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats.byGender.MALE}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-600">여성</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats.byGender.FEMALE}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">지역별 참여</h2>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[960px] w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">지역</th>
                      <th className="px-4 py-3">공채</th>
                      <th className="px-4 py-3">구조 경채</th>
                      <th className="px-4 py-3">학과 경채</th>
                      <th className="px-4 py-3">구급 경채</th>
                      <th className="px-4 py-3">합계</th>
                      <th className="px-4 py-3">평균 원점수</th>
                      <th className="px-4 py-3">평균 최종점수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.byRegion.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-slate-600" colSpan={8}>
                          지역별 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      stats.byRegion.map((region) => (
                        <tr key={region.regionId} className="bg-white">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {region.regionName}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{region.publicCount}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {region.careerRescueCount}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {region.careerAcademicCount}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{region.careerEmtCount}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{region.total}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatScore(region.avgTotalScore)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatScore(region.avgFinalScore)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  지역별 1배수 도달 지표
                </h2>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-1">
                  {availablePredictionExamTypes.map((examType) => {
                    const active = selectedPredictionExamType === examType;
                    return (
                      <button
                        key={examType}
                        type="button"
                        onClick={() => setSelectedPredictionExamType(examType)}
                        className={`rounded px-3 py-1 text-xs font-semibold transition ${
                          active
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {formatPredictionExamType(examType)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">지역</th>
                      <th className="px-4 py-3">참여인원</th>
                      <th className="px-4 py-3">모집인원(1배수 기준)</th>
                      <th className="px-4 py-3">1배수 컷 점수</th>
                      <th className="px-4 py-3">실제 1배수 석등</th>
                      <th className="px-4 py-3">1배수 동점 인원</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {predictionRowsByExamType.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-slate-600" colSpan={6}>
                          1배수 도달 지표 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      predictionRowsByExamType.map((row) => (
                        <tr key={`${row.regionId}-${row.examType}`} className="bg-white">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.regionName}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {row.participantCount.toLocaleString("ko-KR")}명
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {row.oneMultipleBaseRank.toLocaleString("ko-KR")}명
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatPredictionScore(
                              row.oneMultipleCutScore,
                              row.isOneMultipleCutConfirmed
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatPredictionRank(
                              row.oneMultipleActualRank,
                              row.isOneMultipleCutConfirmed
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatPredictionTieCount(
                              row.oneMultipleTieCount,
                              row.isOneMultipleCutConfirmed
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                모집인원은 1배수 기준 인원이고, 실제 석등은 동점자를 포함한 기준입니다.
              </p>
              <p className="text-xs text-slate-500">
                참여인원이 모집인원 미만이면 1배수 지표는 데이터 수집 중으로 표시합니다.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">체감 난이도 현황</h2>
              {!stats.difficulty || stats.difficulty.totalResponses < 1 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  난이도 응답 데이터가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    전체 응답:{" "}
                    <span className="font-semibold text-slate-900">
                      {stats.difficulty.totalResponses.toLocaleString("ko-KR")}건
                    </span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-[760px] w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">과목</th>
                          <th className="px-4 py-3">응답 수</th>
                          <th className="px-4 py-3">쉬움</th>
                          <th className="px-4 py-3">보통</th>
                          <th className="px-4 py-3">어려움</th>
                          <th className="px-4 py-3">우세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stats.difficulty.subjects.length === 0 ? (
                          <tr>
                            <td className="px-4 py-4 text-slate-600" colSpan={6}>
                              과목별 난이도 데이터가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          stats.difficulty.subjects.map((subject) => (
                            <tr key={subject.subjectId} className="bg-white">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {subject.subjectName}
                                {subject.examType === "CAREER_RESCUE" ? (
                                  <span className="ml-1 text-xs font-medium text-sky-700">
                                    (구조 경채)
                                  </span>
                                ) : subject.examType === "CAREER_ACADEMIC" ? (
                                  <span className="ml-1 text-xs font-medium text-sky-700">
                                    (학과 경채)
                                  </span>
                                ) : subject.examType === "CAREER_EMT" ? (
                                  <span className="ml-1 text-xs font-medium text-sky-700">
                                    (구급 경채)
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-slate-700">{subject.responses}</td>
                              <td className="px-4 py-3 text-slate-700">{subject.easy}%</td>
                              <td className="px-4 py-3 text-slate-700">{subject.normal}%</td>
                              <td className="px-4 py-3 text-slate-700">{subject.hard}%</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {subject.dominantLabel}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">
                    경채 전용 과목은 해당 경채 유형 응시자의 응답만 집계합니다.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
