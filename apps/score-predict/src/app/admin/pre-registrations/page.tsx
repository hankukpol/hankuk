"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getResponseErrorMessage, readResponseJson } from "@/lib/read-response-json";

type ExamTypeValue = "PUBLIC" | "CAREER";
type GenderValue = "MALE" | "FEMALE";

interface ExamOption {
  id: number;
  year: number;
  round: number;
  name: string;
}

interface RegionOption {
  id: number;
  name: string;
}

interface PreRegistrationRow {
  id: number;
  examId: number;
  examName: string;
  examYear: number;
  examRound: number;
  userId: number;
  userName: string;
  userPhone: string; // 로그인 아이디
  userContactPhone: string; // 연락처
  regionId: number;
  regionName: string;
  examType: ExamTypeValue;
  gender: GenderValue;
  examNumber: string;
  createdAt: string;
  updatedAt: string;
}

interface PreRegistrationsResponse {
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    totalCount: number;
    publicCount: number;
    careerCount: number;
  };
  preRegistrations: PreRegistrationRow[];
}

interface DrawWinner {
  drawRank: number;
  id: number;
  userName: string;
  userPhone: string; // 로그인 아이디
  userContactPhone: string; // 연락처
  examName: string;
  examYear: number;
  examRound: number;
  regionName: string;
  examType: ExamTypeValue;
  gender: GenderValue;
  examNumber: string;
  updatedAt: string;
}

interface DrawResponse {
  eligibleCount: number;
  requestedWinnerCount: number;
  drawnWinnerCount: number;
  drawnAt: string;
  winners: DrawWinner[];
}

interface PreRegistrationEditDraft {
  examId: number;
  regionId: number;
  examType: ExamTypeValue;
  gender: GenderValue;
  examNumber: string;
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

const PAGE_LIMIT = 20;

function formatDateTimeText(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatExamLabel(row: { examYear: number; examRound: number; examName: string }): string {
  return `${row.examYear}-${row.examRound} ${row.examName}`;
}

function formatExamType(examType: ExamTypeValue): string {
  return examType === "PUBLIC" ? "공채" : "경채";
}

function formatGender(gender: GenderValue): string {
  return gender === "MALE" ? "남" : "여";
}

export default function AdminPreRegistrationsPage() {
  const {
    enabled: preRegistrationsEnabled,
    isLoading: isFeatureLoading,
  } = useAdminSiteFeature("preRegistrations");
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [careerExamEnabled, setCareerExamEnabled] = useState(true);

  const [selectedExamId, setSelectedExamId] = useState<number | "">("");
  const [selectedRegionId, setSelectedRegionId] = useState<number | "">("");
  const [selectedExamType, setSelectedExamType] = useState<"" | ExamTypeValue>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const [rows, setRows] = useState<PreRegistrationRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [publicCount, setPublicCount] = useState(0);
  const [careerCount, setCareerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  const [winnerCount, setWinnerCount] = useState("3");
  const [drawResult, setDrawResult] = useState<DrawResponse | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCopyingWinners, setIsCopyingWinners] = useState(false);

  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<PreRegistrationEditDraft | null>(null);
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<number | null>(null);

  const { confirm, modalProps } = useConfirmModal();

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_LIMIT));
    if (selectedExamId) params.set("examId", String(selectedExamId));
    if (selectedRegionId) params.set("regionId", String(selectedRegionId));
    if (selectedExamType) params.set("examType", selectedExamType);
    if (searchKeyword) params.set("search", searchKeyword);
    return params.toString();
  }, [page, searchKeyword, selectedExamId, selectedExamType, selectedRegionId]);

  const loadFilters = useCallback(async () => {
    const [examResponse, examsMetaResponse] = await Promise.all([
      fetch("/api/admin/exam?feature=preRegistrations", {
        method: "GET",
        cache: "no-store",
      }),
      fetch("/api/exams", { method: "GET", cache: "no-store" }),
    ]);

    const examData = await readResponseJson<{ exams?: ExamOption[]; error?: string }>(examResponse);
    if (!examResponse.ok) {
      throw new Error(getResponseErrorMessage(examResponse, "시험 목록을 불러오지 못했습니다.", examData));
    }

    const metaData = await readResponseJson<{
      regions?: RegionOption[];
      careerExamEnabled?: boolean;
      error?: string;
    }>(examsMetaResponse);
    if (!examsMetaResponse.ok) {
      throw new Error(getResponseErrorMessage(examsMetaResponse, "시험 메타데이터를 불러오지 못했습니다.", metaData));
    }

    setExamOptions(examData?.exams ?? []);
    setRegionOptions(metaData?.regions ?? []);
    setCareerExamEnabled(metaData?.careerExamEnabled ?? true);
  }, []);

  const loadRows = useCallback(async () => {
    const response = await fetch(`/api/admin/pre-registrations?${queryString}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<PreRegistrationsResponse & { error?: string }>(response);
    if (!response.ok) {
      throw new Error(getResponseErrorMessage(response, "사전등록 목록을 불러오지 못했습니다.", data));
    }

    setRows(data?.preRegistrations ?? []);
    setPage(data?.pagination?.page ?? 1);
    setTotalPages(data?.pagination?.totalPages ?? 1);
    setTotalCount(data?.pagination?.totalCount ?? 0);
    setPublicCount(data?.summary?.publicCount ?? 0);
    setCareerCount(data?.summary?.careerCount ?? 0);
  }, [queryString]);

  function beginEdit(row: PreRegistrationRow) {
    setEditingRowId(row.id);
    setEditDraft({
      examId: row.examId,
      regionId: row.regionId,
      examType: row.examType,
      gender: row.gender,
      examNumber: row.examNumber,
    });
    setNotice(null);
  }

  function cancelEdit() {
    setEditingRowId(null);
    setEditDraft(null);
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!preRegistrationsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void (async () => {
      try {
        await loadFilters();
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "필터 데이터를 불러오지 못했습니다.",
        });
      }
    })();
  }, [isFeatureLoading, loadFilters, preRegistrationsEnabled]);

  useEffect(() => {
    if (!careerExamEnabled && selectedExamType === "CAREER") {
      setSelectedExamType("");
    }
  }, [careerExamEnabled, selectedExamType]);

  useEffect(() => {
    setDrawResult(null);
  }, [searchKeyword, selectedExamId, selectedExamType, selectedRegionId]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!preRegistrationsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadRows();
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "사전등록 목록 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, loadRows, preRegistrationsEnabled]);

  useEffect(() => {
    if (editingRowId === null) return;
    if (rows.some((row) => row.id === editingRowId)) return;
    cancelEdit();
  }, [editingRowId, rows]);

  if (isFeatureLoading) {
    return <p className="text-sm text-slate-600">기능 설정을 확인하는 중입니다...</p>;
  }

  if (!preRegistrationsEnabled) {
    return <AdminFeatureDisabledState feature="preRegistrations" />;
  }

  async function handleSaveEdit(row: PreRegistrationRow) {
    if (!editDraft || editingRowId !== row.id) {
      setNotice({ type: "error", message: "수정할 데이터가 없습니다." });
      return;
    }

    setSavingRowId(row.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/pre-registrations?id=${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: editDraft.examId,
          regionId: editDraft.regionId,
          examType: editDraft.examType,
          gender: editDraft.gender,
          examNumber: editDraft.examNumber.trim(),
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "사전등록 수정에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `${row.userName}님의 사전등록을 수정했습니다.`,
      });
      cancelEdit();
      await loadRows();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "사전등록 수정에 실패했습니다.",
      });
    } finally {
      setSavingRowId(null);
    }
  }

  async function handleDeleteRow(row: PreRegistrationRow) {
    const ok = await confirm({
      title: "사전등록 삭제",
      description: `${row.userName}님의 사전등록을 삭제하시겠습니까?`,
      variant: "danger",
      confirmLabel: "삭제",
    });
    if (!ok) return;

    setDeletingRowId(row.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/pre-registrations?id=${row.id}&confirm=true`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "사전등록 삭제에 실패했습니다.");
      }

      if (editingRowId === row.id) {
        cancelEdit();
      }

      setNotice({
        type: "success",
        message: `${row.userName}님의 사전등록을 삭제했습니다.`,
      });
      await loadRows();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "사전등록 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingRowId(null);
    }
  }

  async function handleDownloadCsv() {
    setIsDownloading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      if (selectedExamId) params.set("examId", String(selectedExamId));
      if (selectedRegionId) params.set("regionId", String(selectedRegionId));
      if (selectedExamType) params.set("examType", selectedExamType);
      if (searchKeyword) params.set("search", searchKeyword);

      const response = await fetch(`/api/admin/pre-registrations/export?${params.toString()}`);
      if (!response.ok) {
        throw new Error("CSV 다운로드에 실패했습니다.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `사전등록목록_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "CSV 다운로드에 실패했습니다.",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDrawWinners() {
    setIsDrawing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/pre-registrations/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId || undefined,
          regionId: selectedRegionId || undefined,
          examType: selectedExamType || undefined,
          search: searchKeyword || undefined,
          winnerCount,
        }),
      });
      const data = (await response.json()) as DrawResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "이벤트 추첨에 실패했습니다.");
      }

      setDrawResult(data);
      setNotice({
        type: "success",
        message: `${data.eligibleCount.toLocaleString("ko-KR")}명 중 ${data.drawnWinnerCount.toLocaleString("ko-KR")}명을 추첨했습니다.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "이벤트 추첨에 실패했습니다.",
      });
    } finally {
      setIsDrawing(false);
    }
  }

  async function handleCopyWinners() {
    if (!drawResult || drawResult.winners.length < 1) return;

    const text = drawResult.winners
      .map(
        (winner) =>
          `${winner.drawRank}. ${winner.userName} / ${winner.userPhone} / ${winner.userContactPhone || "-"} / ${winner.regionName} / ${formatExamType(
            winner.examType
          )} / ${winner.examNumber}`
      )
      .join("\n");

    setIsCopyingWinners(true);
    setNotice(null);
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ type: "success", message: "당첨자 정보가 클립보드에 복사되었습니다." });
    } catch {
      setNotice({ type: "error", message: "클립보드 복사에 실패했습니다." });
    } finally {
      setIsCopyingWinners(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900">사전등록 관리</h1>
        <p className="text-sm text-slate-600">
          사전등록 목록 조회, CSV 다운로드, 이벤트 추첨, 관리자 직접 수정/삭제를 할 수 있습니다.
        </p>
      </header>

      {notice ? (
        <section
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-500">전체 사전등록</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{totalCount.toLocaleString("ko-KR")}명</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-500">공채</p>
          <p className="mt-2 text-3xl font-black text-police-700">{publicCount.toLocaleString("ko-KR")}명</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-500">경채</p>
          <p className="mt-2 text-3xl font-black text-cyan-700">{careerCount.toLocaleString("ko-KR")}명</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="이름, 연락처, 응시번호 검색"
          />
          <select
            value={selectedExamId}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedExamId(value ? Number(value) : "");
              setPage(1);
            }}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">전체 시험</option>
            {examOptions.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.year}-{exam.round} {exam.name}
              </option>
            ))}
          </select>
          <select
            value={selectedRegionId}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedRegionId(value ? Number(value) : "");
              setPage(1);
            }}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">전체 지역</option>
            {regionOptions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
          <select
            value={selectedExamType}
            onChange={(event) => {
              setSelectedExamType((event.target.value as "" | ExamTypeValue) ?? "");
              setPage(1);
            }}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">전체 채용유형</option>
            <option value="PUBLIC">공채</option>
            {careerExamEnabled ? <option value="CAREER">경채</option> : null}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setSearchKeyword(searchInput.trim());
              setPage(1);
            }}
          >
            조회
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchInput("");
              setSearchKeyword("");
              setSelectedExamId("");
              setSelectedRegionId("");
              setSelectedExamType("");
              setPage(1);
              setDrawResult(null);
              cancelEdit();
            }}
          >
            필터 초기화
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleDownloadCsv()} disabled={isDownloading}>
            {isDownloading ? "다운로드 중..." : "CSV 내보내기"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-police-200 bg-police-50 p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-police-900">이벤트 추첨</h2>
            <p className="mt-1 text-sm text-police-800">
              현재 필터 조건에 맞는 사전등록자를 대상으로 랜덤 추첨을 진행합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={winnerCount}
              onChange={(event) => setWinnerCount(event.target.value.replace(/[^0-9]/g, ""))}
              className="w-24 bg-white"
              placeholder="3"
            />
            <Button type="button" onClick={() => void handleDrawWinners()} disabled={isDrawing}>
              {isDrawing ? "추첨 중..." : "당첨자 추첨"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopyWinners()}
              disabled={!drawResult || drawResult.winners.length < 1 || isCopyingWinners}
            >
              {isCopyingWinners ? "복사 중..." : "당첨자 복사"}
            </Button>
          </div>
        </div>

        {drawResult ? (
          <div className="mt-4 rounded-lg border border-white/70 bg-white/80 p-4">
            <p className="text-sm text-slate-700">
              대상자 {drawResult.eligibleCount.toLocaleString("ko-KR")}명 중 {drawResult.drawnWinnerCount.toLocaleString("ko-KR")}명 추첨
              완료 {formatDateTimeText(drawResult.drawnAt)}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-200 px-3 py-2 text-left">순번</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">이름</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">아이디</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">연락처</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">지역</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">유형</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">응시번호</th>
                  </tr>
                </thead>
                <tbody>
                  {drawResult.winners.map((winner) => (
                    <tr key={`${winner.id}-${winner.drawRank}`} className="bg-white">
                      <td className="border border-slate-200 px-3 py-2 font-semibold text-police-700">{winner.drawRank}</td>
                      <td className="border border-slate-200 px-3 py-2">{winner.userName}</td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs">{winner.userPhone}</td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs">{winner.userContactPhone || <span className="text-slate-400">-</span>}</td>
                      <td className="border border-slate-200 px-3 py-2">{winner.regionName}</td>
                      <td className="border border-slate-200 px-3 py-2">{formatExamType(winner.examType)}</td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs">{winner.examNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">사전등록 목록</h2>
            <p className="text-sm text-slate-500">
              정식 OMR 제출 전 임시로 저장된 사전등록 정보입니다. 관리자에서 직접 수정하거나 삭제할 수 있습니다.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            총 {totalCount.toLocaleString("ko-KR")}건, {page}/{totalPages} 페이지
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1400px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-200 px-3 py-2 text-left">이름</th>
                <th className="border border-slate-200 px-3 py-2 text-left">아이디</th>
                <th className="border border-slate-200 px-3 py-2 text-left">연락처</th>
                <th className="border border-slate-200 px-3 py-2 text-left">시험</th>
                <th className="border border-slate-200 px-3 py-2 text-left">지역</th>
                <th className="border border-slate-200 px-3 py-2 text-left">채용</th>
                <th className="border border-slate-200 px-3 py-2 text-left">성별</th>
                <th className="border border-slate-200 px-3 py-2 text-left">응시번호</th>
                <th className="border border-slate-200 px-3 py-2 text-left">최초 등록</th>
                <th className="border border-slate-200 px-3 py-2 text-left">최종 수정</th>
                <th className="border border-slate-200 px-3 py-2 text-left">관리</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="border border-slate-200 px-4 py-8 text-center text-slate-500">
                    사전등록 목록을 불러오는 중입니다...
                  </td>
                </tr>
              ) : rows.length < 1 ? (
                <tr>
                  <td colSpan={11} className="border border-slate-200 px-4 py-8 text-center text-slate-500">
                    조건에 맞는 사전등록이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isEditing = editingRowId === row.id && editDraft !== null;
                  const isSaving = savingRowId === row.id;
                  const isDeleting = deletingRowId === row.id;
                  const isBusy = isSaving || isDeleting;

                  return (
                    <tr key={row.id} className="bg-white">
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">{row.userName}</td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">{row.userPhone}</td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700">{row.userContactPhone || <span className="text-slate-400">-</span>}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editDraft.examId}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      examId: Number(event.target.value),
                                    }
                                  : current
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                            disabled={isBusy}
                          >
                            {examOptions.map((exam) => (
                              <option key={exam.id} value={exam.id}>
                                {exam.year}-{exam.round} {exam.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          formatExamLabel(row)
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editDraft.regionId}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      regionId: Number(event.target.value),
                                    }
                                  : current
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                            disabled={isBusy}
                          >
                            {regionOptions.map((region) => (
                              <option key={region.id} value={region.id}>
                                {region.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          row.regionName
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editDraft.examType}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      examType: event.target.value as ExamTypeValue,
                                    }
                                  : current
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                            disabled={isBusy}
                          >
                            <option value="PUBLIC">공채</option>
                            <option value="CAREER" disabled={!careerExamEnabled}>
                              경채
                            </option>
                          </select>
                        ) : (
                          formatExamType(row.examType)
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editDraft.gender}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      gender: event.target.value as GenderValue,
                                    }
                                  : current
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                            disabled={isBusy}
                          >
                            <option value="MALE">남</option>
                            <option value="FEMALE">여</option>
                          </select>
                        ) : (
                          formatGender(row.gender)
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-xs">
                        {isEditing ? (
                          <Input
                            value={editDraft.examNumber}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      examNumber: event.target.value,
                                    }
                                  : current
                              )
                            }
                            className="h-9 min-w-[120px]"
                            disabled={isBusy}
                          />
                        ) : (
                          row.examNumber
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">{formatDateTimeText(row.createdAt)}</td>
                      <td className="border border-slate-200 px-3 py-2">{formatDateTimeText(row.updatedAt)}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <Button type="button" size="sm" onClick={() => void handleSaveEdit(row)} disabled={isSaving}>
                                {isSaving ? "저장 중..." : "저장"}
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => cancelEdit()} disabled={isSaving}>
                                취소
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => beginEdit(row)}
                                disabled={savingRowId !== null || deletingRowId !== null}
                              >
                                수정
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => void handleDeleteRow(row)}
                                disabled={isDeleting || savingRowId !== null}
                              >
                                {isDeleting ? "삭제 중..." : "삭제"}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setPage((prev) => prev - 1)} disabled={!canGoPrev}>
            이전
          </Button>
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
          </span>
          <Button type="button" variant="outline" onClick={() => setPage((prev) => prev + 1)} disabled={!canGoNext}>
            다음
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-bold text-amber-900">운영 안내</h2>
        <div className="mt-3 space-y-2 text-sm text-amber-900">
          <p>1. 사전등록 단계에서는 시험, 지역, 채용유형, 성별, 응시번호만 먼저 저장됩니다.</p>
          <p>2. 정식 OMR 입력이 열리면 저장된 사전등록 정보가 자동으로 불러와집니다.</p>
          <p>3. 관리자 수정도 동일한 중복/응시번호 검증을 통과해야 저장됩니다.</p>
          <p>4. 정식 제출이 완료되어도 사전등록 기록은 유지됩니다.</p>
        </div>
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
