"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CourseType, EnrollmentStatus } from "@prisma/client";
import { toast } from "sonner";

/* ── 타입 ───────────────────────────────────────────────────────────────────── */
export type LedgerEnrollment = {
  id: string;
  examNumber: string;
  courseType: CourseType;
  startDate: string;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status: EnrollmentStatus;
  isRe: boolean;
  createdAt: string;
  student: { name: string; examNumber: string; phone: string | null };
  cohort: { name: string; startDate: string; endDate: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
  staff: { name: string } | null;
};

/* ── 레이블 상수 ─────────────────────────────────────────────────────────────── */
const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "신청",
  ACTIVE: "수강 중",
  WAITING: "대기",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-green-100 text-green-800",
  WAITING: "bg-sky-100 text-sky-800",
  SUSPENDED: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-gray-100 text-gray-700",
  WITHDRAWN: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강 단과",
};

/* ── 유틸 ────────────────────────────────────────────────────────────────────── */
function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

/* ── Props ────────────────────────────────────────────────────────────────────── */
type Props = {
  enrollments: LedgerEnrollment[];
  cohorts: { id: string; name: string }[];
  initialFilters: {
    cohortId: string;
    status: string;
    from: string;
    to: string;
    courseType: string;
  };
};

/* ── 컴포넌트 ─────────────────────────────────────────────────────────────────── */
export function LedgerClient({ enrollments, cohorts, initialFilters }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  // 로컬 필터 상태 (Form submit 방식 대신 URL 동기화)
  const [cohortId, setCohortId] = useState(initialFilters.cohortId);
  const [status, setStatus] = useState(initialFilters.status);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [courseType, setCourseType] = useState(initialFilters.courseType);

  /* ── 필터 적용 ─── */
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (cohortId) params.set("cohortId", cohortId);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (courseType) params.set("courseType", courseType);
    startTransition(() => {
      router.push(`/admin/enrollments/ledger?${params.toString()}`);
    });
  }, [cohortId, status, from, to, courseType, router]);

  const resetFilters = useCallback(() => {
    setCohortId("");
    setStatus("");
    setFrom("");
    setTo("");
    setCourseType("");
    startTransition(() => {
      router.push("/admin/enrollments/ledger");
    });
  }, [router]);

  /* ── KPI 계산 ─── */
  const totalCount = enrollments.length;
  const activeCount = enrollments.filter((e) => e.status === "ACTIVE").length;
  const doneCount = enrollments.filter(
    (e) => e.status === "COMPLETED" || e.status === "WITHDRAWN"
  ).length;

  /* ── Excel 내보내기 ─── */
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("startDate", from);
      if (to) params.set("endDate", to);
      if (initialFilters.cohortId) params.set("cohortId", initialFilters.cohortId);
      if (initialFilters.status) params.set("status", initialFilters.status);
      if (initialFilters.courseType) params.set("courseType", initialFilters.courseType);

      const url = `/api/enrollments/ledger/export?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("내보내기 실패");

      const blob = await res.blob();
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `수강대장_${dateStr}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error("Excel 내보내기에 실패했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  const hasFilter = cohortId || status || from || to || courseType;

  return (
    <>
      {/* ── 필터 바 ── */}
      <div className="no-print mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-[28px] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            {/* 강좌 유형 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">강좌 유형</label>
              <select
                value={courseType}
                onChange={(e) => setCourseType(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
              >
                <option value="">전체 유형</option>
                <option value="COMPREHENSIVE">종합반</option>
                <option value="SPECIAL_LECTURE">특강 단과</option>
              </select>
            </div>

            {/* 기수 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">기수</label>
              <select
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
              >
                <option value="">전체 기수</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 상태 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">수강 상태</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
              >
                <option value="">전체 상태</option>
                {(Object.entries(STATUS_LABEL) as [EnrollmentStatus, string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* 등록일 범위 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">등록일 (시작)</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">등록일 (종료)</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
              />
            </div>

            <button
              type="button"
              onClick={applyFilters}
              disabled={isPending}
              className="rounded-full bg-[#1F4D3A] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#173a2b] disabled:opacity-60"
            >
              {isPending ? "조회 중..." : "조회"}
            </button>
            {hasFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-500"
              >
                초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI 카드 3개 ── */}
      <div className="no-print mx-auto max-w-7xl px-6 pb-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-[28px] bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500">전체</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalCount.toLocaleString()}명</p>
          </div>
          <div className="rounded-[28px] bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500">수강 중</p>
            <p className="mt-1 text-2xl font-bold text-[#1F4D3A]">{activeCount.toLocaleString()}명</p>
          </div>
          <div className="rounded-[28px] bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-gray-500">수료 / 퇴원</p>
            <p className="mt-1 text-2xl font-bold text-[#C55A11]">{doneCount.toLocaleString()}명</p>
          </div>
        </div>
      </div>

      {/* ── 액션 버튼 및 결과 수 ── */}
      <div className="no-print mx-auto max-w-7xl px-6 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            조회 결과: <strong>{enrollments.length}건</strong>
            {enrollments.length >= 1000 && (
              <span className="ml-2 text-amber-600">(최대 1000건 표시)</span>
            )}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-full bg-[#1F4D3A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173a2b] disabled:opacity-60"
            >
              {isExporting ? (
                "내보내는 중..."
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  Excel 내보내기
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-500 hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              인쇄 (A4 가로)
            </button>
          </div>
        </div>
      </div>

      {/* ── 수강생 명단 테이블 ── */}
      <div className="mx-auto max-w-7xl px-6 pb-16">
        {enrollments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
            조회된 수강 등록 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="ledger-table w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#1F4D3A] text-white">
                  {[
                    "번호", "학번", "성명(연락처)", "강좌명",
                    "유형", "수강시작", "수강종료", "수강료",
                    "상태", "등록일",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border border-[#1F4D3A] px-3 py-2.5 text-center font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enr, idx) => {
                  const courseName =
                    enr.cohort?.name ??
                    enr.specialLecture?.name ??
                    enr.product?.name ??
                    "-";
                  const isEven = idx % 2 === 0;
                  return (
                    <tr key={enr.id} className={isEven ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center font-mono">
                        <a
                          href={`/admin/students/${enr.student.examNumber}`}
                          className="text-[#1F4D3A] underline underline-offset-2 hover:text-[#C55A11]"
                        >
                          {enr.student.examNumber}
                        </a>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <a
                          href={`/admin/students/${enr.student.examNumber}`}
                          className="block font-semibold text-gray-900 hover:text-[#C55A11]"
                        >
                          {enr.student.name}
                        </a>
                        {enr.student.phone && (
                          <span className="mt-0.5 block font-mono text-xs text-gray-500">
                            {enr.student.phone}
                          </span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-gray-800">
                        {courseName}
                        {enr.isRe && (
                          <span className="ml-1 text-xs text-[#C55A11]">(재수강)</span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-xs text-gray-600">
                        {COURSE_TYPE_LABEL[enr.courseType]}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                        {formatDate(enr.startDate)}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                        {enr.endDate ? formatDate(enr.endDate) : "-"}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-right text-gray-800">
                        {formatMoney(enr.finalFee)}
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[enr.status]}`}
                        >
                          {STATUS_LABEL[enr.status]}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-3 py-2 text-center text-gray-600">
                        {formatDate(enr.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
