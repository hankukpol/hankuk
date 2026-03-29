"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AdminRole, CourseType, EnrollmentStatus, EnrollSource, ExamCategory } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  COURSE_TYPE_LABEL,
  ENROLL_SOURCE_LABEL,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { FilterPresetBar } from "@/components/ui/filter-preset-bar";
import { useFilterPresets } from "@/hooks/use-filter-presets";
import { EmptyState } from "@/components/ui/empty-state";

export type EnrollmentWithRelations = {
  id: string;
  examNumber: string;
  courseType: CourseType;
  startDate: string;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status: EnrollmentStatus;
  enrollSource: EnrollSource | null;
  isRe: boolean;
  createdAt: string;
  student: { name: string; phone: string | null };
  cohort: { name: string; examCategory: ExamCategory } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
  contract?: { id: string; printedAt: string | Date | null } | null;
};

type Props = {
  initialEnrollments: EnrollmentWithRelations[];
  /** Caller's admin role — used to gate bulk-complete button */
  adminRole?: AdminRole;
};

const STATUS_FILTERS: Array<{ value: EnrollmentStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "ACTIVE", label: "수강 중" },
  { value: "PENDING", label: "신청" },
  { value: "SUSPENDED", label: "휴원" },
  { value: "WITHDRAWN", label: "퇴원" },
  { value: "COMPLETED", label: "완료" },
];

const COURSE_TYPE_FILTERS: Array<{ value: CourseType | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "COMPREHENSIVE", label: "종합반" },
  { value: "SPECIAL_LECTURE", label: "특강 단과" },
];

const STATUS_TRANSITIONS: Partial<Record<EnrollmentStatus, EnrollmentStatus[]>> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "COMPLETED"],
  SUSPENDED: ["ACTIVE"],
  WAITING: ["ACTIVE", "CANCELLED"],
};

const STATUS_TRANSITION_LABEL: Partial<Record<EnrollmentStatus, string>> = {
  ACTIVE: "수강 중으로 변경",
  SUSPENDED: "휴원 처리",
  COMPLETED: "완료 처리",
  CANCELLED: "취소 처리",
};

function SortableHeader({
  col,
  label,
  currentSort,
  currentDir,
  onSort,
}: {
  col: string;
  label: string;
  currentSort: string;
  currentDir: string;
  onSort: (col: string, dir: string) => void;
}) {
  const isActive = currentSort === col;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";
  return (
    <button
      type="button"
      onClick={() => onSort(col, nextDir)}
      className="flex items-center gap-1 font-semibold hover:text-ember transition-colors text-left"
    >
      {label}
      {isActive ? (
        <span className="text-ember">{currentDir === "asc" ? "↑" : "↓"}</span>
      ) : (
        <span className="text-gray-300">↕</span>
      )}
    </button>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function CourseName({ enrollment }: { enrollment: EnrollmentWithRelations }) {
  if (enrollment.cohort) {
    return (
      <div>
        <div className="font-medium text-ink">{enrollment.cohort.name}</div>
        {enrollment.product ? (
          <div className="mt-0.5 text-xs text-slate">{enrollment.product.name}</div>
        ) : null}
      </div>
    );
  }
  if (enrollment.specialLecture) {
    return <div className="font-medium text-ink">{enrollment.specialLecture.name}</div>;
  }
  return <span className="text-slate">-</span>;
}

// AdminRole hierarchy values (higher = more permissions)
const ROLE_ORDER: Record<AdminRole, number> = {
  VIEWER: 0,
  TEACHER: 1,
  COUNSELOR: 2,
  ACADEMIC_ADMIN: 3,
  MANAGER: 4,
  DEPUTY_DIRECTOR: 5,
  DIRECTOR: 6,
  SUPER_ADMIN: 7,
};

function roleAtLeast(role: AdminRole | undefined, min: AdminRole): boolean {
  if (!role) return false;
  return (ROLE_ORDER[role] ?? -1) >= (ROLE_ORDER[min] ?? 999);
}

export function EnrollmentList({ initialEnrollments, adminRole }: Props) {
  const [enrollments, setEnrollments] = useState<EnrollmentWithRelations[]>(initialEnrollments);
  const [filterStatus, setFilterStatus] = useState<EnrollmentStatus | "ALL">("ALL");
  const [filterCourseType, setFilterCourseType] = useState<CourseType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: string, dir: string) {
    setSort(col);
    setSortDir(dir as "asc" | "desc");
  }
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const { presets, savePreset, deletePreset } = useFilterPresets("enrollments-filter-presets");

  const currentFilters: Record<string, string> = {};
  if (filterStatus !== "ALL") currentFilters.status = filterStatus;
  if (filterCourseType !== "ALL") currentFilters.courseType = filterCourseType;
  if (search.trim()) currentFilters.search = search.trim();

  function applyPresetFilters(filters: Record<string, string>) {
    setFilterStatus((filters.status as EnrollmentStatus) ?? "ALL");
    setFilterCourseType((filters.courseType as CourseType) ?? "ALL");
    setSearch(filters.search ?? "");
  }

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const canBulkComplete = roleAtLeast(adminRole, AdminRole.DIRECTOR);

  const filteredIds = new Set(
    enrollments
      .filter((e) => {
        if (filterStatus !== "ALL" && e.status !== filterStatus) return false;
        if (filterCourseType !== "ALL" && e.courseType !== filterCourseType) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          if (!e.student.name.toLowerCase().includes(q) && !e.examNumber.includes(q)) return false;
        }
        return true;
      })
      .map((e) => e.id),
  );

  const allFilteredSelected =
    filteredIds.size > 0 && [...filteredIds].every((id) => selectedIds.has(id));
  const someFilteredSelected = [...filteredIds].some((id) => selectedIds.has(id)) && !allFilteredSelected;

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function handleBulkComplete() {
    const ids = [...selectedIds].filter((id) => filteredIds.has(id));
    if (ids.length === 0) {
      setErrorMessage("완료 처리할 수강을 선택해주세요.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "선택 완료처리",
      badgeTone: "default",
      title: `수강 완료 처리 (${ids.length}건)`,
      description: "선택한 수강 내역을 완료(수료) 처리합니다. 수강 중 또는 휴원 상태인 경우에만 완료 처리됩니다.",
      details: [
        `선택 건수: ${ids.length}건`,
        "대기·취소·퇴원·이미 완료된 항목은 자동으로 건너뜁니다.",
      ],
      cancelLabel: "취소",
      confirmLabel: "완료 처리",
      confirmTone: "default",
      onConfirm: () => {
        confirmModal.closeModal();
        setSuccessMessage(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            const res = await requestJson<{ updatedCount: number; skippedIds: string[] }>(
              "/api/enrollments/bulk",
              { method: "POST", body: JSON.stringify({ action: "complete", ids }) },
            );
            setEnrollments((prev) =>
              prev.map((e) => (ids.includes(e.id) && ["ACTIVE", "SUSPENDED"].includes(e.status))
                ? { ...e, status: "COMPLETED" as EnrollmentStatus }
                : e,
              ),
            );
            setSelectedIds(new Set());
            const skipped = res.skippedIds.length;
            setSuccessMessage(
              `${res.updatedCount}건을 완료 처리했습니다.` +
              (skipped > 0 ? ` (${skipped}건 건너뜀)` : ""),
            );
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "완료 처리에 실패했습니다.");
          }
        });
      },
    });
  }

  const filtered = enrollments.filter((e) => filteredIds.has(e.id));

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sort === "studentName") return dir * a.student.name.localeCompare(b.student.name, "ko");
    if (sort === "finalFee") return dir * (a.finalFee - b.finalFee);
    if (sort === "startDate")
      return dir * (new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    // default: createdAt
    return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  function handleStatusChange(enrollment: EnrollmentWithRelations, newStatus: EnrollmentStatus) {
    setSuccessMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await requestJson<{ enrollment: EnrollmentWithRelations }>(
          `/api/enrollments/${enrollment.id}`,
          { method: "PATCH", body: JSON.stringify({ status: newStatus }) },
        );
        setEnrollments((prev) =>
          prev.map((e) => (e.id === enrollment.id ? result.enrollment : e)),
        );
        setSuccessMessage(
          `${enrollment.student.name} 학생의 수강 상태를 ${ENROLLMENT_STATUS_LABEL[newStatus]}(으)로 변경했습니다.`,
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
      }
    });
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (filterStatus !== "ALL") params.set("status", filterStatus);
    if (filterCourseType !== "ALL") params.set("courseType", filterCourseType);
    window.open(`/api/enrollments/ledger/export?${params.toString()}`, "_blank");
  }

  function handleWithdraw(enrollment: EnrollmentWithRelations) {
    confirmModal.openModal({
      badgeLabel: "퇴원 처리",
      badgeTone: "warning",
      title: `퇴원 처리: ${enrollment.student.name}`,
      description: "이 학생을 퇴원 처리하시겠습니까? 수강 상태가 퇴원으로 변경됩니다.",
      details: [
        `학생: ${enrollment.student.name} (${enrollment.examNumber})`,
        enrollment.cohort ? `기수: ${enrollment.cohort.name}` : "",
        `최종 수강료: ${enrollment.finalFee.toLocaleString()}원`,
      ].filter(Boolean),
      cancelLabel: "취소",
      confirmLabel: "퇴원 처리",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setSuccessMessage(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            const result = await requestJson<{ enrollment: EnrollmentWithRelations }>(
              `/api/enrollments/${enrollment.id}`,
              { method: "DELETE" },
            );
            setEnrollments((prev) =>
              prev.map((e) => (e.id === enrollment.id ? result.enrollment : e)),
            );
            setSuccessMessage(`${enrollment.student.name} 학생을 퇴원 처리했습니다.`);
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "퇴원 처리에 실패했습니다.");
          }
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          {/* Status filter */}
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterStatus(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterStatus === f.value
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Course type filter */}
          <div className="flex flex-wrap gap-1">
            {COURSE_TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterCourseType(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterCourseType === f.value
                    ? "bg-forest text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Bulk complete button — DIRECTOR+ only */}
          {canBulkComplete && selectedIds.size > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleBulkComplete}
              className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 완료처리 ({selectedIds.size}건)
            </button>
          )}
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 수험번호 검색"
            className="rounded-full border border-ink/10 px-4 py-2 text-sm outline-none focus:border-ink/30 w-52"
          />
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-full border border-forest/30 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
          >
            Excel 내보내기
          </button>
          <Link
            href="/admin/enrollments/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            <span>+</span>
            <span>수강 등록</span>
          </Link>
        </div>
      </div>

      {/* Filter Presets */}
      <FilterPresetBar
        presets={presets}
        currentFilters={currentFilters}
        onApply={applyPresetFilters}
        onSave={savePreset}
        onDelete={deletePreset}
      />

      {/* Messages */}
      {successMessage ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {canBulkComplete && (
                  <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = someFilteredSelected; }}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="accent-ember"
                      aria-label="전체 선택"
                    />
                  </th>
                )}
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  <SortableHeader
                    col="studentName"
                    label="학생"
                    currentSort={sort}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  수강 유형
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  강좌/기수
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  <SortableHeader
                    col="startDate"
                    label="기간"
                    currentSort={sort}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  <SortableHeader
                    col="finalFee"
                    label="수강료"
                    currentSort={sort}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  상태
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  등록 경로
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  <SortableHeader
                    col="createdAt"
                    label="등록일"
                    currentSort={sort}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  계약서
                </th>
                <th className="sticky top-0 z-10 text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/95 backdrop-blur-sm text-left whitespace-nowrap">
                  액션
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={canBulkComplete ? 11 : 10}>
                    <EmptyState
                      title="수강 내역이 없습니다."
                      description="조회 조건을 변경하거나 새 수강을 등록해보세요."
                      action={{ label: "수강 등록", href: "/admin/enrollments/new" }}
                    />
                  </td>
                </tr>
              ) : null}
              {sorted.map((enrollment) => {
                const availableTransitions = STATUS_TRANSITIONS[enrollment.status] ?? [];
                const canWithdraw =
                  enrollment.status !== "WITHDRAWN" && enrollment.status !== "COMPLETED";

                return (
                  <tr
                    key={enrollment.id}
                    className={`hover:bg-mist/30 transition ${isPending ? "opacity-60" : ""}`}
                  >
                    {/* 선택 체크박스 (DIRECTOR+ 전용) */}
                    {canBulkComplete && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(enrollment.id)}
                          onChange={(e) => toggleSelect(enrollment.id, e.target.checked)}
                          className="accent-ember"
                          aria-label={`${enrollment.student.name} 선택`}
                        />
                      </td>
                    )}
                    {/* 학생 */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{enrollment.student.name}</div>
                      <div className="mt-0.5 text-xs text-slate">{enrollment.examNumber}</div>
                      {enrollment.isRe ? (
                        <span className="mt-0.5 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                          재수강
                        </span>
                      ) : null}
                    </td>

                    {/* 수강 유형 */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          enrollment.courseType === "COMPREHENSIVE"
                            ? "bg-forest/10 text-forest border border-forest/20"
                            : "bg-sky-50 text-sky-700 border border-sky-200"
                        }`}
                      >
                        {COURSE_TYPE_LABEL[enrollment.courseType]}
                      </span>
                    </td>

                    {/* 강좌/기수 */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <CourseName enrollment={enrollment} />
                      {enrollment.cohort ? (
                        <div className="mt-0.5 text-xs text-slate">
                          {EXAM_CATEGORY_LABEL[enrollment.cohort.examCategory]}
                        </div>
                      ) : null}
                    </td>

                    {/* 기간 */}
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      <div>{formatDate(enrollment.startDate)}</div>
                      {enrollment.endDate ? (
                        <div>~ {formatDate(enrollment.endDate)}</div>
                      ) : (
                        <div className="text-ink/30">종료일 미정</div>
                      )}
                    </td>

                    {/* 수강료 */}
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      <div className="font-medium text-ink">
                        {enrollment.finalFee.toLocaleString()}원
                      </div>
                      {enrollment.discountAmount > 0 ? (
                        <div className="mt-0.5 text-xs text-slate line-through">
                          {enrollment.regularFee.toLocaleString()}원
                        </div>
                      ) : null}
                    </td>

                    {/* 상태 */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                      >
                        {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                      </span>
                    </td>

                    {/* 등록 경로 */}
                    <td className="px-4 py-3 text-sm text-slate">
                      {enrollment.enrollSource
                        ? ENROLL_SOURCE_LABEL[enrollment.enrollSource]
                        : "-"}
                    </td>

                    {/* 계약서 상태 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {!enrollment.contract ? (
                        <Link
                          href={`/admin/enrollments/${enrollment.id}/contract`}
                          className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 transition hover:border-red-400 whitespace-nowrap"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          미생성
                        </Link>
                      ) : enrollment.contract.printedAt ? (
                        <Link
                          href={`/admin/enrollments/${enrollment.id}/contract`}
                          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest transition hover:border-forest/40 whitespace-nowrap"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          발행됨
                        </Link>
                      ) : (
                        <Link
                          href={`/admin/enrollments/${enrollment.id}/contract`}
                          className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 transition hover:border-amber-400 whitespace-nowrap"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          미출력
                        </Link>
                      )}
                    </td>

                    {/* 액션 */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {availableTransitions.map((nextStatus) => (
                          <button
                            key={nextStatus}
                            type="button"
                            disabled={isPending}
                            onClick={() => handleStatusChange(enrollment, nextStatus)}
                            className="inline-flex items-center rounded-full border border-ink/10 px-2.5 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                          >
                            {STATUS_TRANSITION_LABEL[nextStatus] ?? ENROLLMENT_STATUS_LABEL[nextStatus]}
                          </button>
                        ))}
                        {canWithdraw ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleWithdraw(enrollment)}
                            className="inline-flex items-center rounded-full border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                          >
                            퇴원
                          </button>
                        ) : null}
                        <Link
                          href={`/admin/enrollments/${enrollment.id}`}
                          className="inline-flex items-center rounded-full border border-ink/10 px-2.5 py-1 text-xs font-semibold text-slate transition hover:border-ink/30 whitespace-nowrap"
                        >
                          상세
                        </Link>
                        <Link
                          href={`/admin/enrollments/${enrollment.id}/card`}
                          className="inline-flex items-center rounded-full border border-forest/20 px-2.5 py-1 text-xs font-semibold text-forest transition hover:border-forest/50 whitespace-nowrap"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          수강증
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdraw confirm modal */}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
