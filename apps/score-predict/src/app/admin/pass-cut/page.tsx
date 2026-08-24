"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import useConfirmModal from "@/hooks/useConfirmModal";
import { Button } from "@/components/ui/button";
import { useTenantConfig } from "@/components/providers/TenantProvider";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  isActive: boolean;
}

interface ReleaseItem {
  id: number;
  examId: number;
  releaseNumber: number;
  releasedAt: string;
  participantCount: number;
  memo: string | null;
  createdBy: {
    id: number;
    name: string;
  };
  snapshotCount: number;
}

type ShadowPredictionStatus =
  | "READY"
  | "CALIBRATION_REQUIRED"
  | "MISSING_APPLICANTS"
  | "INSUFFICIENT_SAMPLE"
  | "INCONSISTENT_INPUT";

interface ShadowPredictionRow {
  regionId: number;
  regionName: string;
  examType: "PUBLIC" | "CAREER";
  recruitCount: number;
  writtenPassCount: number;
  applicantCount: number | null;
  participantCount: number;
  coverageRate: number | null;
  status: ShadowPredictionStatus;
  rawOneMultipleCutScore: number | null;
  rawWrittenPassCutScore: number | null;
  correctedWrittenPassCutScore: number | null;
  sensitivityLowScore: number | null;
  sensitivityHighScore: number | null;
  possibleMinScore: number | null;
  likelyMinScore: number | null;
  sureMinScore: number | null;
  scenarioCount: number;
}

interface ShadowPredictionResponse {
  modelVersion: string;
  calibrated: false;
  publicExposure: false;
  generatedAt: string;
  releaseNumber: number;
  rows: ShadowPredictionRow[];
  error?: string;
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

async function readResponseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function formatScore(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}점`;
}

function formatShadowStatus(status: ShadowPredictionStatus): string {
  if (status === "CALIBRATION_REQUIRED") return "보정모델 검증 대기";
  if (status === "MISSING_APPLICANTS") return "출원인원 필요";
  if (status === "INSUFFICIENT_SAMPLE") return "표본 수집 중";
  if (status === "INCONSISTENT_INPUT") return "입력값 확인 필요";
  return "관리자 수치 비노출";
}

export default function AdminPassCutPage() {
  const tenant = useTenantConfig();
  const { enabled: passCutEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("passCut");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const { confirm, modalProps } = useConfirmModal();

  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [shadowPrediction, setShadowPrediction] = useState<ShadowPredictionResponse | null>(null);
  const [shadowError, setShadowError] = useState<string | null>(null);
  const [isShadowLoading, setIsShadowLoading] = useState(false);

  const nextReleaseNumber = useMemo(() => {
    const used = new Set(releases.map((release) => release.releaseNumber));
    for (let n = 1; n <= 4; n += 1) {
      if (!used.has(n)) return n;
    }
    return null;
  }, [releases]);

  async function loadExams() {
    const response = await fetch("/api/admin/exam?feature=passCut", {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<{ exams?: ExamItem[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? `시험 목록을 불러오지 못했습니다. (${response.status})`);
    }
    const nextExams = data?.exams ?? [];
    setExams(nextExams);
    setSelectedExamId((current) => {
      if (current && nextExams.some((exam) => exam.id === current)) return current;
      if (nextExams.length < 1) return null;
      const active = nextExams.find((exam) => exam.isActive) ?? nextExams[0];
      return active.id;
    });
  }

  async function loadReleases(examId: number) {
    const response = await fetch(`/api/admin/pass-cut-release?examId=${examId}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<{ releases?: ReleaseItem[]; error?: string }>(response);
    if (!response.ok) {
      throw new Error(data?.error ?? `합격컷 발표 이력을 불러오지 못했습니다. (${response.status})`);
    }
    setReleases(data?.releases ?? []);
  }

  const loadShadowPrediction = useCallback(async (examId: number) => {
    if (tenant.type !== "police") return;
    setIsShadowLoading(true);
    setShadowError(null);
    try {
      const response = await fetch(
        `/api/admin/police-prediction-shadow?examId=${examId}`,
        { method: "GET", cache: "no-store" }
      );
      const data = await readResponseJson<ShadowPredictionResponse>(response);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `그림자 합격예측을 불러오지 못했습니다. (${response.status})`);
      }
      setShadowPrediction(data);
    } catch (error) {
      setShadowPrediction(null);
      setShadowError(
        error instanceof Error ? error.message : "그림자 합격예측을 불러오지 못했습니다."
      );
    } finally {
      setIsShadowLoading(false);
    }
  }, [tenant.type]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!passCutEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadExams();
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "초기 데이터 로딩 중 오류가 발생했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, passCutEnabled]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!passCutEnabled || !selectedExamId) {
      setReleases([]);
      return;
    }
    (async () => {
      try {
        await loadReleases(selectedExamId);
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "발표 이력 조회에 실패했습니다.",
        });
      }
    })();
  }, [isFeatureLoading, passCutEnabled, selectedExamId]);

  useEffect(() => {
    if (isFeatureLoading || !passCutEnabled || !selectedExamId || tenant.type !== "police") {
      setShadowPrediction(null);
      setShadowError(null);
      return;
    }
    void loadShadowPrediction(selectedExamId);
  }, [isFeatureLoading, loadShadowPrediction, passCutEnabled, selectedExamId, tenant.type]);

  async function handleRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!selectedExamId) {
      setNotice({ type: "error", message: "시험을 먼저 선택해 주세요." });
      return;
    }
    if (!nextReleaseNumber) {
      setNotice({ type: "error", message: "이미 1~4차 발표가 모두 등록되었습니다." });
      return;
    }

    const ok = await confirm({ title: "합격컷 발표", description: `${nextReleaseNumber}차 합격컷을 발표하시겠습니까?` });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/pass-cut-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          releaseNumber: nextReleaseNumber,
          memo: memo.trim() || null,
          autoNotice: true,
        }),
      });
      const data = await readResponseJson<{
        success?: boolean;
        releaseNumber?: number;
        snapshotCount?: number;
        error?: string;
      }>(response);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? `합격컷 발표 처리에 실패했습니다. (${response.status})`);
      }

      setMemo("");
      setNotice({
        type: "success",
        message: `${data.releaseNumber}차 발표가 등록되었습니다. (스냅샷 ${data.snapshotCount ?? 0}건)`,
      });
      await loadReleases(selectedExamId);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "합격컷 발표 처리에 실패했습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isFeatureLoading || (passCutEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">관리 화면을 불러오는 중입니다...</p>;
  }

  if (!passCutEnabled) {
    return <AdminFeatureDisabledState feature="passCut" />;
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">합격컷 발표 관리 화면을 불러오는 중입니다...</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">합격컷 발표 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          1~4차 단계별 합격컷을 발표하고, 발표 시점의 지역별 스냅샷을 저장합니다.
        </p>
      </header>

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

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="exam-id">
            시험 선택
          </label>
          <select
            id="exam-id"
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm md:max-w-md"
            value={selectedExamId ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSelectedExamId(Number.isInteger(next) ? next : null);
            }}
          >
            {exams.length < 1 ? <option value="">시험 없음</option> : null}
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.year}년 {exam.round}차 - {exam.name}
                {exam.isActive ? " (활성)" : ""}
              </option>
            ))}
          </select>
        </div>

        <form className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={handleRelease}>
          <p className="text-sm font-semibold text-slate-800">
            다음 발표 차수:{" "}
            <span className="text-service-700">
              {nextReleaseNumber ? `${nextReleaseNumber}차` : "완료"}
            </span>
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="release-memo">
              발표 메모
            </label>
            <textarea
              id="release-memo"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="예: 표본이 800명 이상 확보되어 3차 발표 진행"
            />
          </div>
          <Button type="submit" disabled={isSubmitting || !selectedExamId || nextReleaseNumber === null}>
            {isSubmitting
              ? "처리 중..."
              : nextReleaseNumber
                ? `${nextReleaseNumber}차 합격컷 발표하기`
                : "발표 완료"}
          </Button>
        </form>
      </section>

      {tenant.type === "police" ? (
        <section className="admin-page-section space-y-4" aria-labelledby="shadow-prediction-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="shadow-prediction-title">합격예측 그림자 모델</h2>
              <p className="mt-1 text-sm text-slate-600">
                검증 가능한 원표본 관측값만 표시하며, 보정 결과는 공식 결과 교정 전까지 잠급니다.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isShadowLoading || !selectedExamId}
              onClick={() => selectedExamId && void loadShadowPrediction(selectedExamId)}
            >
              {isShadowLoading ? "확인 중..." : "현재 표본 다시 확인"}
            </Button>
          </div>

          <div className="admin-status-strip border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">보정모델 검증 대기</p>
            <p className="mt-1">
              공식 결과로 보정되기 전까지 보정 선발배수와 가능권, 유력권, 확실권 수치를 표시하지
              않습니다. 학생 화면과 공개 API도 계속 잠겨 있습니다.
            </p>
          </div>

          {shadowError ? (
            <p className="admin-status-strip border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {shadowError}
            </p>
          ) : isShadowLoading && !shadowPrediction ? (
            <p className="text-sm text-slate-600">현재 원표본 관측값을 확인하는 중입니다...</p>
          ) : shadowPrediction ? (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                <span>적용 차수: {shadowPrediction.releaseNumber}차</span>
                <span>모델: {shadowPrediction.modelVersion}</span>
                <span>계산 시각: {formatDateTime(shadowPrediction.generatedAt)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px]">
                  <thead>
                    <tr>
                      <th>지역</th>
                      <th>채용</th>
                      <th>모집 / 필기선발</th>
                      <th>표본 / 참여율</th>
                      <th>원표본 1배수</th>
                      <th>원표본 선발배수</th>
                      <th>보정 상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shadowPrediction.rows.length < 1 ? (
                      <tr>
                        <td colSpan={7}>확인할 지역별 모집 데이터가 없습니다.</td>
                      </tr>
                    ) : (
                      shadowPrediction.rows.map((row) => (
                        <tr key={`${row.regionId}-${row.examType}`}>
                          <th scope="row">{row.regionName}</th>
                          <td>{row.examType === "CAREER" ? "경행경채" : "공채"}</td>
                          <td>
                            {row.recruitCount.toLocaleString("ko-KR")}명 /{" "}
                            {row.writtenPassCount.toLocaleString("ko-KR")}명
                          </td>
                          <td>
                            {row.participantCount.toLocaleString("ko-KR")}명 /{" "}
                            {row.coverageRate === null ? "-" : `${row.coverageRate.toFixed(1)}%`}
                          </td>
                          <td>{formatScore(row.rawOneMultipleCutScore)}</td>
                          <td>{formatScore(row.rawWrittenPassCutScore)}</td>
                          <td>{formatShadowStatus(row.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-600">
                원표본 컷은 현재 입력자 순위에서 직접 관측되는 값이며 실제 전체 응시자 합격컷은 아닙니다.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">차수</th>
              <th className="whitespace-nowrap px-4 py-3">발표일시</th>
              <th className="whitespace-nowrap px-4 py-3">참여자</th>
              <th className="whitespace-nowrap px-4 py-3">스냅샷</th>
              <th className="whitespace-nowrap px-4 py-3">발표자</th>
              <th className="whitespace-nowrap px-4 py-3">메모</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {releases.length < 1 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={6}>
                  아직 등록된 발표 이력이 없습니다.
                </td>
              </tr>
            ) : (
              releases.map((release) => (
                <tr key={release.id} className="bg-white">
                  <td className="px-4 py-3 font-semibold text-slate-900">{release.releaseNumber}차</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(release.releasedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {release.participantCount.toLocaleString("ko-KR")}명
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{release.snapshotCount.toLocaleString("ko-KR")}건</td>
                  <td className="px-4 py-3 text-slate-700">{release.createdBy.name}</td>
                  <td className="px-4 py-3 text-slate-700">{release.memo ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
