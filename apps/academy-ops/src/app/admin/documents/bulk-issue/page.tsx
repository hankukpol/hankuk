"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = "ENROLLMENT_CERT" | "ATTENDANCE_CERT" | "SCORE_REPORT";

type CohortOption = {
  id: string;
  name: string;
  examCategory: string;
  enrollmentCount: number;
};

type StudentDoc = {
  examNumber: string;
  name: string;
  mobile: string | null;
  courseName: string;
  startDate: string;
  endDate: string | null;
  // For attendance cert
  totalDays?: number;
  presentDays?: number;
  absentDays?: number;
  attendanceRate?: string;
  attendStartDate?: string | null;
  attendEndDate?: string | null;
  // For score report
  scoreAverage?: number | null;
  lastExamDate?: string | null;
};

type FetchState = "idle" | "loading" | "done" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<DocType, string> = {
  ENROLLMENT_CERT: "수강확인서",
  ATTENDANCE_CERT: "출결증명서",
  SCORE_REPORT: "성적확인서",
};

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKorDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatTodayKor(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ─── Document Renderer ────────────────────────────────────────────────────────

function EnrollmentCertDoc({ student, index }: { student: StudentDoc; index: number }) {
  const today = formatTodayKor();
  return (
    <div
      className="relative w-full bg-white"
      style={{
        minHeight: "270mm",
        padding: "20mm 22mm",
        pageBreakAfter: "always",
        breakAfter: "page",
        fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
      }}
    >
      {/* Page number — screen only */}
      <span
        className="no-print absolute right-4 top-4 rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs text-slate"
        style={{ printColorAdjust: "exact" }}
      >
        {index + 1}
      </span>

      {/* Title */}
      <h1
        className="mb-8 text-center text-3xl font-bold text-ink"
        style={{ letterSpacing: "0.5em" }}
      >
        수 강 확 인 서
      </h1>

      <p className="mb-8 text-center text-base leading-relaxed text-ink">
        위 학생은 당 학원에 다음과 같이 수강하고 있음을 확인합니다.
      </p>

      {/* Main info table */}
      <div className="mb-10 border border-ink/20">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-ink/10">
              <th className="w-32 bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                성&nbsp;&nbsp;&nbsp;&nbsp;명
              </th>
              <td className="px-5 py-3.5 text-ink">{student.name}</td>
              <th className="w-32 bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                수험번호
              </th>
              <td className="px-5 py-3.5 font-mono text-ink">{student.examNumber}</td>
            </tr>
            <tr className="border-b border-ink/10">
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                연락처
              </th>
              <td className="px-5 py-3.5 text-ink" colSpan={3}>
                {student.mobile ?? "—"}
              </td>
            </tr>
            <tr className="border-b border-ink/10">
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                강&nbsp;&nbsp;&nbsp;&nbsp;좌
              </th>
              <td className="px-5 py-3.5 font-medium text-ink" colSpan={3}>
                {student.courseName}
              </td>
            </tr>
            <tr>
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                수강기간
              </th>
              <td className="px-5 py-3.5 text-ink" colSpan={3}>
                {formatKorDate(student.startDate)}
                {student.endDate ? ` ~ ${formatKorDate(student.endDate)}` : " ~ (미정)"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ height: "60mm" }} />

      <p className="mb-8 text-center text-base text-ink">{today}</p>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <p className="text-base font-semibold text-ink">학원장</p>
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ember text-xs font-semibold text-ember">
            (인)
          </div>
        </div>
        <p className="text-sm text-slate">학원 주소는 관리자 설정을 확인하세요</p>
        <p className="text-sm text-slate">연락처는 관리자 설정을 확인하세요</p>
      </div>
    </div>
  );
}

function AttendanceCertDoc({ student, index }: { student: StudentDoc; index: number }) {
  const today = formatTodayKor();
  const totalDays = student.totalDays ?? 0;
  return (
    <div
      className="relative w-full bg-white"
      style={{
        minHeight: "270mm",
        padding: "20mm 22mm",
        pageBreakAfter: "always",
        breakAfter: "page",
        fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
      }}
    >
      <span className="no-print absolute right-4 top-4 rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs text-slate">
        {index + 1}
      </span>

      <h1
        className="mb-8 text-center text-3xl font-bold text-ink"
        style={{ letterSpacing: "0.5em" }}
      >
        출 결 증 명 서
      </h1>

      <p className="mb-8 text-center text-base leading-relaxed text-ink">
        위 학생의 출결 현황을 다음과 같이 증명합니다.
      </p>

      <div className="mb-6 border border-ink/20">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-ink/10">
              <th className="w-32 bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                성&nbsp;&nbsp;&nbsp;&nbsp;명
              </th>
              <td className="px-5 py-3.5 text-ink">{student.name}</td>
              <th className="w-32 bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                수험번호
              </th>
              <td className="px-5 py-3.5 font-mono text-ink">{student.examNumber}</td>
            </tr>
            <tr className="border-b border-ink/10">
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                강&nbsp;&nbsp;&nbsp;&nbsp;좌
              </th>
              <td className="px-5 py-3.5 font-medium text-ink" colSpan={3}>
                {student.courseName}
              </td>
            </tr>
            <tr>
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                기&nbsp;&nbsp;&nbsp;&nbsp;간
              </th>
              <td className="px-5 py-3.5 text-ink" colSpan={3}>
                {student.attendStartDate
                  ? `${formatKorDate(student.attendStartDate)} ~ ${student.attendEndDate ? formatKorDate(student.attendEndDate) : "현재"}`
                  : "출결 기록 없음"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-10 border border-ink/20">
        <div className="bg-mist px-5 py-3 text-sm font-semibold text-ink">출결 현황</div>
        {totalDays === 0 ? (
          <p className="px-5 py-4 text-sm text-slate">출결 기록이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-ink/10">
                <th className="w-40 bg-mist/50 px-5 py-3 text-left font-medium text-ink">
                  총 수업일
                </th>
                <td className="px-5 py-3 font-semibold text-ink">{totalDays}일</td>
              </tr>
              <tr className="border-t border-ink/10">
                <th className="bg-mist/50 px-5 py-3 text-left font-medium text-ink">
                  출&nbsp;&nbsp;&nbsp;&nbsp;석
                </th>
                <td className="px-5 py-3 font-semibold text-forest">
                  {student.presentDays ?? 0}일{" "}
                  <span className="ml-1 font-normal text-slate">
                    ({student.attendanceRate ?? "0.0"}%)
                  </span>
                </td>
              </tr>
              <tr className="border-t border-ink/10">
                <th className="bg-mist/50 px-5 py-3 text-left font-medium text-ink">
                  결&nbsp;&nbsp;&nbsp;&nbsp;석
                </th>
                <td className="px-5 py-3 font-semibold text-ember">
                  {student.absentDays ?? 0}일
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div style={{ height: "40mm" }} />

      <p className="mb-8 text-center text-base text-ink">{today}</p>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <p className="text-base font-semibold text-ink">학원장</p>
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ember text-xs font-semibold text-ember">
            (인)
          </div>
        </div>
        <p className="text-sm text-slate">학원 주소는 관리자 설정을 확인하세요</p>
        <p className="text-sm text-slate">연락처는 관리자 설정을 확인하세요</p>
      </div>
    </div>
  );
}

function ScoreReportDoc({ student, index }: { student: StudentDoc; index: number }) {
  const today = formatTodayKor();
  return (
    <div
      className="relative w-full bg-white"
      style={{
        minHeight: "270mm",
        padding: "20mm 22mm",
        pageBreakAfter: "always",
        breakAfter: "page",
        fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
      }}
    >
      <span className="no-print absolute right-4 top-4 rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs text-slate">
        {index + 1}
      </span>

      <h1
        className="mb-8 text-center text-3xl font-bold text-ink"
        style={{ letterSpacing: "0.5em" }}
      >
        성 적 확 인 서
      </h1>

      <p className="mb-8 text-center text-base leading-relaxed text-ink">
        위 학생의 학원 모의고사 성적을 다음과 같이 확인합니다.
      </p>

      <div className="mb-10 border border-ink/20">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-ink/10">
              <th className="w-32 bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                성&nbsp;&nbsp;&nbsp;&nbsp;명
              </th>
              <td className="px-5 py-3.5 text-ink">{student.name}</td>
              <th className="w-32 bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                수험번호
              </th>
              <td className="px-5 py-3.5 font-mono text-ink">{student.examNumber}</td>
            </tr>
            <tr className="border-b border-ink/10">
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                강&nbsp;&nbsp;&nbsp;&nbsp;좌
              </th>
              <td className="px-5 py-3.5 font-medium text-ink" colSpan={3}>
                {student.courseName}
              </td>
            </tr>
            <tr className="border-b border-ink/10">
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                평균점수
              </th>
              <td className="px-5 py-3.5 font-semibold text-ink" colSpan={3}>
                {student.scoreAverage != null
                  ? `${student.scoreAverage.toFixed(1)}점`
                  : "—"}
              </td>
            </tr>
            <tr>
              <th className="bg-mist px-5 py-3.5 text-left font-semibold text-ink">
                최근 시험일
              </th>
              <td className="px-5 py-3.5 text-ink" colSpan={3}>
                {student.lastExamDate ? formatKorDate(student.lastExamDate) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-10 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-700">
        본 확인서는 학원 내 아침 모의고사 성적 기준으로 발급되며, 공식 시험 성적과 다를 수 있습니다.
      </div>

      <div style={{ height: "50mm" }} />

      <p className="mb-8 text-center text-base text-ink">{today}</p>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <p className="text-base font-semibold text-ink">학원장</p>
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ember text-xs font-semibold text-ember">
            (인)
          </div>
        </div>
        <p className="text-sm text-slate">학원 주소는 관리자 설정을 확인하세요</p>
        <p className="text-sm text-slate">연락처는 관리자 설정을 확인하세요</p>
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function BulkIssuePage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [docType, setDocType] = useState<DocType>("ENROLLMENT_CERT");
  const [selectionMode, setSelectionMode] = useState<"cohort" | "manual">("cohort");
  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [manualExamNumbers, setManualExamNumbers] = useState("");
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [cohortFetchState, setCohortFetchState] = useState<FetchState>("idle");
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [, startTransition] = useTransition();

  // ── Cohort loader ──────────────────────────────────────────────────────────
  const loadCohorts = useCallback(async () => {
    if (cohortFetchState === "loading" || cohorts.length > 0) return;
    setCohortFetchState("loading");
    try {
      const res = await fetch("/api/cohorts?status=ACTIVE");
      if (!res.ok) throw new Error("기수 목록 로드 실패");
      const json = await res.json();
      const list: CohortOption[] = (json.cohorts ?? []).map(
        (c: { id: string; name: string; examCategory: string; activeCount?: number }) => ({
          id: c.id,
          name: c.name,
          examCategory: c.examCategory,
          enrollmentCount: c.activeCount ?? 0,
        })
      );
      setCohorts(list);
      setCohortFetchState("done");
    } catch {
      setCohortFetchState("error");
    }
  }, [cohortFetchState, cohorts.length]);

  // ── Load cohorts when tab activates ───────────────────────────────────────
  const handleSelectionModeChange = (mode: "cohort" | "manual") => {
    setSelectionMode(mode);
    if (mode === "cohort") loadCohorts();
  };

  // ── Fetch students for preview ─────────────────────────────────────────────
  const handlePreview = async () => {
    setErrorMsg("");
    setStudents([]);
    setFetchState("loading");

    try {
      const params = new URLSearchParams();
      params.set("docType", docType);
      if (selectionMode === "cohort") {
        if (!selectedCohortId) {
          setErrorMsg("기수를 선택하세요.");
          setFetchState("idle");
          return;
        }
        params.set("cohortId", selectedCohortId);
      } else {
        const nums = manualExamNumbers
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (nums.length === 0) {
          setErrorMsg("학번을 입력하세요.");
          setFetchState("idle");
          return;
        }
        params.set("examNumbers", nums.join(","));
      }

      const res = await fetch(`/api/documents/bulk-preview?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "데이터 로드 실패");
      }
      const json = await res.json();
      setStudents(json.data ?? []);
      setFetchState("done");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setFetchState("error");
    }
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    startTransition(() => {
      // Ensure React has flushed any pending state before printing
    });
    setTimeout(() => window.print(), 100);
  };

  // ── Selected cohort name ───────────────────────────────────────────────────
  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page { size: A4 portrait; margin: 0; }
          .print-page-break { page-break-after: always; break-after: page; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>

      {/* ── Screen UI ── */}
      <div className="no-print p-8 sm:p-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/admin/documents"
            className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            서류 발급 센터
          </Link>
          <span className="text-ink/20">/</span>
          <span className="text-sm font-medium text-ink">일괄 출력</span>
        </div>

        {/* Header */}
        <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
          Bulk Document Issuance
        </div>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">일괄 서류 출력</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
              기수 또는 학번 목록으로 여러 학생의 서류를 한 번에 출력합니다.
            </p>
          </div>
        </div>

        {/* ── Step 1: Doc type ── */}
        <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink mb-4">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest text-xs font-bold text-white">
              1
            </span>
            서류 유형 선택
          </h2>
          <div className="flex flex-wrap gap-3">
            {(["ENROLLMENT_CERT", "ATTENDANCE_CERT", "SCORE_REPORT"] as DocType[]).map((type) => (
              <button
                key={type}
                onClick={() => setDocType(type)}
                className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition ${
                  docType === type
                    ? "border-forest bg-forest text-white shadow-sm"
                    : "border-ink/15 bg-white text-slate hover:border-forest/40 hover:text-ink"
                }`}
              >
                {DOC_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </section>

        {/* ── Step 2: Student selector ── */}
        <section className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink mb-4">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest text-xs font-bold text-white">
              2
            </span>
            학생 선택
          </h2>

          {/* Mode toggle */}
          <div className="mb-5 flex gap-1 rounded-2xl border border-ink/10 bg-mist/60 p-1 w-fit">
            {(["cohort", "manual"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleSelectionModeChange(mode)}
                className={`rounded-[14px] px-5 py-2 text-sm font-medium transition ${
                  selectionMode === mode
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                {mode === "cohort" ? "기수별 선택" : "학번 직접 입력"}
              </button>
            ))}
          </div>

          {/* Cohort selector */}
          {selectionMode === "cohort" && (
            <div>
              {cohortFetchState === "idle" && (
                <button
                  onClick={loadCohorts}
                  className="rounded-2xl border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
                >
                  기수 목록 불러오기
                </button>
              )}
              {cohortFetchState === "loading" && (
                <p className="text-sm text-slate">기수 목록 로드 중...</p>
              )}
              {cohortFetchState === "error" && (
                <p className="text-sm text-red-500">기수 목록을 불러오지 못했습니다.</p>
              )}
              {cohorts.length > 0 && (
                <div>
                  <select
                    value={selectedCohortId}
                    onChange={(e) => setSelectedCohortId(e.target.value)}
                    className="rounded-2xl border border-ink/15 px-4 py-2.5 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 transition min-w-[280px]"
                  >
                    <option value="">기수 선택...</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{" "}
                        ({EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory}
                        {c.enrollmentCount > 0 ? ` · ${c.enrollmentCount}명` : ""})
                      </option>
                    ))}
                  </select>
                  {selectedCohort && (
                    <p className="mt-2 text-xs text-slate">
                      선택된 기수: <span className="font-medium text-ink">{selectedCohort.name}</span>{" "}
                      · 예상 학생 수: {selectedCohort.enrollmentCount}명
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual examNumber input */}
          {selectionMode === "manual" && (
            <div>
              <textarea
                value={manualExamNumbers}
                onChange={(e) => setManualExamNumbers(e.target.value)}
                placeholder="학번을 쉼표 또는 줄바꿈으로 구분하여 입력&#10;예: 2024001, 2024002, 2024003"
                rows={4}
                className="w-full rounded-2xl border border-ink/15 px-4 py-3 text-sm font-mono text-ink outline-none placeholder:text-slate/40 focus:border-forest focus:ring-1 focus:ring-forest/20 transition resize-none"
              />
              <p className="mt-1.5 text-xs text-slate">
                쉼표(,), 공백, 줄바꿈으로 구분 — 최대 100명
              </p>
            </div>
          )}
        </section>

        {/* ── Step 3: Preview & Print ── */}
        <section className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink mb-4">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest text-xs font-bold text-white">
              3
            </span>
            미리보기 & 출력
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handlePreview}
              disabled={fetchState === "loading"}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
            >
              {fetchState === "loading" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  데이터 로드 중...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  미리보기 생성
                </>
              )}
            </button>

            {students.length > 0 && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                일괄 출력 ({students.length}명)
              </button>
            )}
          </div>

          {errorMsg && (
            <p className="mt-3 text-sm text-red-500">{errorMsg}</p>
          )}

          {/* Preview summary */}
          {fetchState === "done" && students.length > 0 && (
            <div className="mt-5 rounded-2xl border border-forest/20 bg-forest/5 px-5 py-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-forest/70">서류 유형</p>
                  <p className="mt-0.5 font-semibold text-forest">{DOC_TYPE_LABELS[docType]}</p>
                </div>
                <div>
                  <p className="text-xs text-forest/70">선택 학생 수</p>
                  <p className="mt-0.5 font-semibold text-forest">{students.length}명</p>
                </div>
                {selectionMode === "cohort" && selectedCohort && (
                  <div>
                    <p className="text-xs text-forest/70">기수</p>
                    <p className="mt-0.5 font-semibold text-forest">{selectedCohort.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-forest/70">출력 매수</p>
                  <p className="mt-0.5 font-semibold text-forest">{students.length}장 (A4)</p>
                </div>
              </div>
            </div>
          )}

          {fetchState === "done" && students.length === 0 && (
            <div className="mt-5 rounded-2xl border border-dashed border-ink/10 px-5 py-8 text-center text-sm text-slate">
              선택한 조건에 해당하는 학생이 없습니다.
            </div>
          )}
        </section>

        {/* ── Preview list (screen) ── */}
        {students.length > 0 && (
          <section className="mt-4 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
            <div className="border-b border-ink/10 bg-mist/50 px-6 py-4">
              <p className="text-sm font-semibold text-ink">
                미리보기 목록 — {students.length}명
              </p>
              <p className="mt-0.5 text-xs text-slate">
                아래 목록을 확인한 후 &ldquo;일괄 출력&rdquo; 버튼을 클릭하세요.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/30">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      #
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      학번
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      이름
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      강좌
                    </th>
                    {docType === "ATTENDANCE_CERT" && (
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        출석률
                      </th>
                    )}
                    {docType === "SCORE_REPORT" && (
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        평균
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {students.map((s, i) => (
                    <tr key={s.examNumber} className="hover:bg-mist/30 transition">
                      <td className="px-5 py-3 text-xs text-slate">{i + 1}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate">{s.examNumber}</td>
                      <td className="px-5 py-3 font-medium text-ink">{s.name}</td>
                      <td className="px-5 py-3 text-xs text-slate truncate max-w-[200px]">
                        {s.courseName}
                      </td>
                      {docType === "ATTENDANCE_CERT" && (
                        <td className="px-5 py-3 text-right text-xs">
                          <span
                            className={
                              Number(s.attendanceRate ?? 0) >= 80
                                ? "text-forest font-semibold"
                                : "text-ember font-semibold"
                            }
                          >
                            {s.attendanceRate ?? "0.0"}%
                          </span>
                        </td>
                      )}
                      {docType === "SCORE_REPORT" && (
                        <td className="px-5 py-3 text-right text-xs font-semibold text-ink">
                          {s.scoreAverage != null ? `${s.scoreAverage.toFixed(1)}점` : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Usage note */}
        <div className="mt-6 rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <h3 className="text-sm font-semibold text-forest mb-2">출력 안내</h3>
          <ul className="space-y-1.5 text-sm text-forest/80">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest/50" />
              &ldquo;일괄 출력&rdquo; 클릭 후 인쇄 대화상자에서 용지 크기를 <strong>A4</strong>로 선택하세요.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest/50" />
              각 학생 문서가 별도 페이지로 출력됩니다.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest/50" />
              출결증명서는 ClassroomAttendanceLog 기준으로 집계됩니다.
            </li>
          </ul>
        </div>
      </div>

      {/* ── Print area — hidden on screen via CSS, visible when printing ── */}
      {students.length > 0 && (
        <div className="print-only" aria-hidden="true">
          {students.map((student, i) => {
            if (docType === "ENROLLMENT_CERT") {
              return <EnrollmentCertDoc key={student.examNumber} student={student} index={i} />;
            }
            if (docType === "ATTENDANCE_CERT") {
              return <AttendanceCertDoc key={student.examNumber} student={student} index={i} />;
            }
            return <ScoreReportDoc key={student.examNumber} student={student} index={i} />;
          })}
        </div>
      )}
    </>
  );
}
