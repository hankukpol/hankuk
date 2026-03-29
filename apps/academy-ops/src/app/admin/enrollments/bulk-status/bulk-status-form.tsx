"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { EnrollmentStatus, CourseType, EnrollSource, ExamCategory } from "@prisma/client";
import { toast } from "sonner";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  COURSE_TYPE_LABEL,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export type BulkEnrollmentRow = {
  id: string;
  examNumber: string;
  courseType: CourseType;
  startDate: string;
  endDate: string | null;
  finalFee: number;
  status: EnrollmentStatus;
  enrollSource: EnrollSource | null;
  createdAt: string;
  student: { name: string; phone: string | null };
  cohort: { name: string; examCategory: ExamCategory } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
};

type BulkAction = {
  value: EnrollmentStatus;
  label: string;
  description: string;
  colorClass: string;
};

// ───────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────

const BULK_ACTIONS: BulkAction[] = [
  {
    value: EnrollmentStatus.WITHDRAWN,
    label: "수강 취소",
    description: "WITHDRAWN",
    colorClass: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
  },
  {
    value: EnrollmentStatus.COMPLETED,
    label: "수료 처리",
    description: "COMPLETED",
    colorClass: "border-ink/20 bg-ink/5 text-ink hover:bg-ink/10",
  },
  {
    value: EnrollmentStatus.SUSPENDED,
    label: "휴원 처리",
    description: "SUSPENDED",
    colorClass: "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100",
  },
  {
    value: EnrollmentStatus.ACTIVE,
    label: "복교 처리",
    description: "→ ACTIVE",
    colorClass: "border-forest/30 bg-forest/10 text-forest hover:bg-forest/20",
  },
];

const FILTER_STATUSES: Array<{ value: EnrollmentStatus; label: string }> = [
  { value: EnrollmentStatus.ACTIVE, label: "수강 중" },
  { value: EnrollmentStatus.SUSPENDED, label: "휴원" },
  { value: EnrollmentStatus.WAITING, label: "대기" },
  { value: EnrollmentStatus.PENDING, label: "신청" },
];

// ───────────────────────────────────────────────────────────────────────
// API helper
// ───────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "요청에 실패했습니다.");
  return data as T;
}

// ───────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────

type Props = {
  initialEnrollments: BulkEnrollmentRow[];
  initialStatus: EnrollmentStatus;
};

export function BulkStatusForm({ initialEnrollments, initialStatus }: Props) {
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus>(initialStatus);
  const [enrollments, setEnrollments] = useState<BulkEnrollmentRow[]>(initialEnrollments);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, startLoad] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Filtered by current status tab
  const filtered = enrollments.filter((e) => e.status === statusFilter);
  const filteredIds = filtered.map((e) => e.id);

  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const loadEnrollments = useCallback(
    (status: EnrollmentStatus) => {
      startLoad(async () => {
        try {
          const data = await fetchJson<{ enrollments: BulkEnrollmentRow[] }>(
            `/api/enrollments?status=${status}&limit=200`,
          );
          setEnrollments((prev) => {
            // Replace enrollments for this status, keep others
            const others = prev.filter((e) => e.status !== status);
            return [...others, ...(data.enrollments as BulkEnrollmentRow[])];
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "조회 실패");
        }
      });
    },
    [],
  );

  function handleStatusTabChange(status: EnrollmentStatus) {
    setStatusFilter(status);
    setSelectedIds(new Set());
    loadEnrollments(status);
  }

  function handleBulkAction(action: BulkAction) {
    const ids = Array.from(selectedIds).filter((id) => filteredIds.includes(id));
    if (ids.length === 0) {
      toast.error("선택된 항목이 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `선택한 ${ids.length}건을 "${action.label}" 처리합니다.\n계속하시겠습니까?`,
    );
    if (!confirmed) return;

    startSubmit(async () => {
      try {
        const result = await fetchJson<{
          updatedCount: number;
          skippedIds: string[];
          skippedReasons?: Record<string, string>;
          message?: string;
        }>("/api/enrollments/bulk-status", {
          method: "POST",
          body: JSON.stringify({ enrollmentIds: ids, newStatus: action.value }),
        });

        if (result.updatedCount > 0) {
          toast.success(`${result.updatedCount}건 처리 완료`);
          // Refresh the current tab
          loadEnrollments(statusFilter);
          setSelectedIds(new Set());
        }

        if (result.skippedIds.length > 0) {
          toast.warning(
            `${result.skippedIds.length}건은 상태 전환 조건 미충족으로 건너뛰었습니다.`,
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리 실패");
      }
    });
  }

  const selectedCount = Array.from(selectedIds).filter((id) => filteredIds.includes(id)).length;

  return (
    <div className="space-y-5">
      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_STATUSES.map((f) => {
          const count = enrollments.filter((e) => e.status === f.value).length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => handleStatusTabChange(f.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-[#1F4D3A] text-white"
                  : "bg-white border border-[#E5E7EB] text-[#4B5563] hover:bg-[#F7F4EF]"
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 text-xs ${
                  statusFilter === f.value ? "text-white/70" : "text-[#9CA3AF]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-[20px] border border-[#C55A11]/30 bg-[#FFF4EE] px-5 py-3">
          <span className="text-sm font-semibold text-[#C55A11]">
            {selectedCount}건 선택됨
          </span>
          <span className="text-[#D1D5DB]">|</span>
          {BULK_ACTIONS.map((action) => (
            <button
              key={action.value}
              type="button"
              onClick={() => handleBulkAction(action)}
              disabled={isSubmitting}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${action.colorClass}`}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-[#9CA3AF]">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#9CA3AF]">
            {ENROLLMENT_STATUS_LABEL[statusFilter]} 상태의 수강 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F3F4F6] bg-[#F7F4EF]">
                  <th className="w-10 py-3 pl-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-[#1F4D3A]"
                      aria-label="전체 선택"
                    />
                  </th>
                  <th className="py-3 pl-3 pr-4 text-left font-semibold text-[#4B5563]">학생</th>
                  <th className="py-3 px-4 text-left font-semibold text-[#4B5563] hidden sm:table-cell">
                    강좌/기수
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-[#4B5563] hidden md:table-cell">
                    기간
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-[#4B5563] hidden lg:table-cell">
                    수강료
                  </th>
                  <th className="py-3 px-4 text-center font-semibold text-[#4B5563]">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((enrollment) => {
                  const isChecked = selectedIds.has(enrollment.id);
                  const courseName =
                    enrollment.cohort?.name ??
                    enrollment.product?.name ??
                    enrollment.specialLecture?.name ??
                    "—";
                  return (
                    <tr
                      key={enrollment.id}
                      onClick={() => toggleOne(enrollment.id)}
                      className={`cursor-pointer border-b border-[#F3F4F6] last:border-0 transition-colors ${
                        isChecked ? "bg-[#F7F4EF]" : "hover:bg-[#FAFAF9]"
                      }`}
                    >
                      <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(enrollment.id)}
                          className="h-4 w-4 accent-[#1F4D3A]"
                          aria-label={`${enrollment.student.name} 선택`}
                        />
                      </td>
                      <td className="py-3 pl-3 pr-4">
                        <Link
                          href={`/admin/students/${enrollment.examNumber}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-[#111827] hover:text-[#C55A11] transition-colors"
                        >
                          {enrollment.student.name}
                        </Link>
                        <p className="text-xs text-[#9CA3AF]">{enrollment.examNumber}</p>
                      </td>
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <p className="text-[#111827] truncate max-w-[160px]">{courseName}</p>
                        <p className="text-xs text-[#9CA3AF]">
                          {COURSE_TYPE_LABEL[enrollment.courseType]}
                          {enrollment.cohort &&
                            ` · ${EXAM_CATEGORY_LABEL[enrollment.cohort.examCategory]}`}
                        </p>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell text-[#4B5563] text-xs">
                        <p>{formatDate(enrollment.startDate)}</p>
                        {enrollment.endDate && (
                          <p className="text-[#9CA3AF]">~ {formatDate(enrollment.endDate)}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell text-right text-[#111827] font-medium">
                        {enrollment.finalFee.toLocaleString()}원
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                        >
                          {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-[#9CA3AF] text-right">
          총 {filtered.length}건 표시 (최대 200건)
        </p>
      )}
    </div>
  );
}
