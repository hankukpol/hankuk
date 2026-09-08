"use client";

import { useId } from "react";
import { DialogActions } from "@/components/ui/DialogActions";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState } from "react";
import {
  ArrowRight,
  CalendarX,
  CircleAlert,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/lib/sonner";
import { usePathname, useRouter } from "next/navigation";

import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { StudentStatusBadge, TuitionExemptBadge, WarningStageBadge } from "@/components/students/StudentBadges";
import {
  STUDENT_STATUS_OPTIONS,
  WARNING_STAGE_OPTIONS,
  getStudentStatusLabel,
  toDemeritPoints,
  getWarningStageLabel,
} from "@/lib/student-meta";
import type { SeatOptionItem } from "@/lib/services/seat.service";
import type { StudentListItem } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";

type StudentListManagerProps = {
  divisionSlug: string;
  initialStudents: StudentListItem[];
  canManage: boolean;
  studyTrackOptions?: string[];
  seatOptions?: SeatOptionItem[];
  tuitionPlans?: TuitionPlanItem[];
  initialCreateOpen?: boolean;
  /** 서버에서 전달된 오늘 날짜 (KST, yyyy-MM-dd). Hydration 안정성을 위해 사용 */
  today?: string;
  /** 서버 컴포넌트에서 전달된 URL 쿼리 파라미터. useSearchParams 대신 사용하여 hydration 안정성 보장 */
  initialSearchParams?: Record<string, string | undefined>;
};

const sortOptions = [
  { value: "studentNumber", label: "수험번호순" },
  { value: "name", label: "이름순" },
  { value: "netPoints", label: "벌점순" },
  { value: "createdAt", label: "최근 등록순" },
  { value: "courseEndDate", label: "만료임박순" },
] as const;

type StatusFilterValue = "ALL" | (typeof STUDENT_STATUS_OPTIONS)[number]["value"];
type WarningFilterValue = "ALL" | (typeof WARNING_STAGE_OPTIONS)[number]["value"];

const statusFilterValues = new Set(["ALL", ...STUDENT_STATUS_OPTIONS.map((option) => option.value)]);
const warningFilterValues = new Set(["ALL", ...WARNING_STAGE_OPTIONS.map((option) => option.value)]);
const sortFilterValues = new Set(sortOptions.map((option) => option.value));

const LazyStudentForm = dynamic(
  () => import("@/components/students/StudentForm").then((mod) => mod.StudentForm),
  {
    ssr: false,
    loading: () => (
      <div className="admin-notice">
        학생 등록 폼을 불러오는 중입니다.
      </div>
    ),
  },
);

function getValidQueryValue<T extends string>(value: string | null, validValues: Set<string>, fallback: T): T {
  if (!value) {
    return fallback;
  }

  return (validValues.has(value) ? value : fallback) as T;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

function getTrackOptions(students: StudentListItem[], configuredTracks: string[]) {
  return Array.from(
    new Set([
      ...configuredTracks,
      ...students.map((student) => student.studyTrack).filter((track): track is string => Boolean(track)),
    ]),
  );
}

export function StudentListManager({
  divisionSlug,
  initialStudents,
  canManage,
  studyTrackOptions = [],
  seatOptions = [],
  tuitionPlans = [],
  initialCreateOpen = false,
  today,
  initialSearchParams = {},
}: StudentListManagerProps) {
  const warningLabels = initialStudents[0]?.warningStageLabels;
  const dialogFormId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(() => initialSearchParams.q ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(() =>
    getValidQueryValue(initialSearchParams.status ?? null, statusFilterValues, "ALL"),
  );
  const [warningFilter, setWarningFilter] = useState<WarningFilterValue>(() =>
    getValidQueryValue(initialSearchParams.warning ?? null, warningFilterValues, "ALL"),
  );
  const [trackFilter, setTrackFilter] = useState(() => initialSearchParams.track ?? "ALL");
  const [expiringFilter, setExpiringFilter] = useState(() => initialSearchParams.expiring === "true");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]["value"]>(() =>
    getValidQueryValue(initialSearchParams.sort ?? null, sortFilterValues, "studentNumber"),
  );
  const [isCreateOpen, setIsCreateOpen] = useState(initialCreateOpen);
  const [deleteTarget, setDeleteTarget] = useState<StudentListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const allTrackOptions = useMemo(
    () => getTrackOptions(initialStudents, studyTrackOptions),
    [initialStudents, studyTrackOptions],
  );

  // 서버에서 전달된 today가 없으면 클라이언트에서 한 번만 계산 (hydration 이후)
  const [stableToday] = useState(() => today ?? new Date().toISOString().slice(0, 10));

  const filteredStudents = useMemo(() => {
    const todayMs = new Date(stableToday + "T00:00:00Z").getTime();
    const matched = initialStudents.filter((student) => {
      const trackValue = student.studyTrack?.toLowerCase() ?? "";
      const matchesSearch =
        !deferredSearch ||
        student.name.toLowerCase().includes(deferredSearch) ||
        student.studentNumber.toLowerCase().includes(deferredSearch) ||
        trackValue.includes(deferredSearch);
      const matchesStatus = statusFilter === "ALL" || student.status === statusFilter;
      const matchesWarning = warningFilter === "ALL" || student.warningStage === warningFilter;
      const matchesTrack = trackFilter === "ALL" || student.studyTrack === trackFilter;
      const matchesExpiring = !expiringFilter || (() => {
        if (!student.courseEndDate) return false;
        const endMs = new Date(student.courseEndDate + "T00:00:00Z").getTime();
        const days = Math.round((endMs - todayMs) / 86400000);
        return days >= -3 && days <= 30;
      })();

      return matchesSearch && matchesStatus && matchesWarning && matchesTrack && matchesExpiring;
    });

    const sorted = [...matched];
    sorted.sort((left, right) => {
      switch (sortBy) {
        case "name":
          return left.name.localeCompare(right.name, "ko");
        case "netPoints":
          return (
            (right.demeritPoints ?? toDemeritPoints(right.netPoints)) - (left.demeritPoints ?? toDemeritPoints(left.netPoints)) ||
            left.name.localeCompare(right.name, "ko")
          );
        case "createdAt":
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        case "courseEndDate": {
          const leftEnd = left.courseEndDate ?? "9999-12-31";
          const rightEnd = right.courseEndDate ?? "9999-12-31";
          return leftEnd.localeCompare(rightEnd) || left.name.localeCompare(right.name, "ko");
        }
        default:
          return left.studentNumber.localeCompare(right.studentNumber, "ko");
      }
    });

    return sorted;
  }, [deferredSearch, initialStudents, sortBy, statusFilter, warningFilter, trackFilter, expiringFilter, stableToday]);

  const summary = useMemo(
    () =>
      initialStudents.reduce(
        (accumulator, student) => {
          accumulator.total += 1;

          if (student.status === "ACTIVE") {
            accumulator.active += 1;
          }

          if (student.warningStage !== "NORMAL") {
            accumulator.warning += 1;
          }

          if (student.status === "WITHDRAWN") {
            accumulator.withdrawn += 1;
          }

          return accumulator;
        },
        { total: 0, active: 0, warning: 0, withdrawn: 0 },
      ),
    [initialStudents],
  );

  const activeFilterCount = [
    Boolean(search.trim()),
    statusFilter !== "ALL",
    warningFilter !== "ALL",
    trackFilter !== "ALL",
    expiringFilter,
  ].filter(Boolean).length;

  const updateListQuery = useCallback(
    (updates: {
      q?: string | null;
      status?: string | null;
      warning?: string | null;
      track?: string | null;
      sort?: string | null;
      panel?: string | null;
      expiring?: string | null;
    }) => {
      const nextParams = new URLSearchParams();

      // 현재 state 값을 기본으로 사용하되, updates 에 명시된 키는 오버라이드
      const q = updates.q !== undefined ? updates.q : search.trim() || null;
      const status = updates.status !== undefined ? updates.status : statusFilter;
      const warning = updates.warning !== undefined ? updates.warning : warningFilter;
      const track = updates.track !== undefined ? updates.track : trackFilter;
      const sort = updates.sort !== undefined ? updates.sort : sortBy;
      const expiring = updates.expiring !== undefined ? updates.expiring : (expiringFilter ? "true" : null);
      const panel = updates.panel !== undefined ? updates.panel : null;

      if (q) nextParams.set("q", q);
      if (status && status !== "ALL") nextParams.set("status", status);
      if (warning && warning !== "ALL") nextParams.set("warning", warning);
      if (track && track !== "ALL") nextParams.set("track", track);
      if (sort && sort !== "studentNumber") nextParams.set("sort", sort);
      if (expiring === "true") nextParams.set("expiring", "true");
      if (panel) nextParams.set("panel", panel);

      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, search, statusFilter, warningFilter, trackFilter, sortBy, expiringFilter],
  );

  /** 검색어 입력 디바운스 → URL 동기화 */
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      updateListQuery({ q: search.trim() || null });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search, updateListQuery]);

  function updatePanelQuery(open: boolean) {
    updateListQuery({ panel: open ? "create" : null });
  }

  function openCreatePanel() {
    setIsCreateOpen(true);
    updatePanelQuery(true);
  }

  function closeCreatePanel() {
    setIsCreateOpen(false);
    updatePanelQuery(false);
  }

  async function handleDeleteStudent(event: FormEvent) {
    event.preventDefault();
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/${divisionSlug}/students/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "학생 삭제에 실패했습니다.");
      }
      toast.success(`${deleteTarget.name} 학생을 삭제했습니다.`);
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setWarningFilter("ALL");
    setTrackFilter("ALL");
    setExpiringFilter(false);
    setSortBy("studentNumber");
    updateListQuery({
      q: null,
      status: null,
      warning: null,
      track: null,
      sort: null,
      expiring: null,
    });
  }

  return (
    <>
      <div className="admin-flat-page">
        {/* DESIGN.md 5.3 — 붙어 있는 스트립이 아니라 16px 간격의 개별 KPI 카드 */}
        <section className="admin-dashboard-metrics">
          <article className="admin-dashboard-metric">
            <div className="min-w-0">
                <p className="admin-dashboard-metric-label">전체 학생</p>
                <p className="admin-dashboard-metric-value">
                  {summary.total}
                  <span className="admin-dashboard-metric-unit">명</span>
                </p>
                <p className="admin-help mt-2">현재 지점에 등록된 전체 학생 수</p>
              </div>
          </article>

          <article className="admin-dashboard-metric">
            <div className="min-w-0">
                <p className="admin-dashboard-metric-label">재원</p>
                <p className="admin-dashboard-metric-value text-attend-present">
                  {summary.active}
                  <span className="admin-dashboard-metric-unit">명</span>
                </p>
                <p className="admin-help mt-2">현재 출결 및 운영 관리 대상</p>
              </div>
          </article>

          <article className="admin-dashboard-metric">
            <div className="min-w-0">
                <p className="admin-dashboard-metric-label">경고 진입</p>
                <p className="admin-dashboard-metric-value text-attend-tardy">
                  {summary.warning}
                  <span className="admin-dashboard-metric-unit">명</span>
                </p>
                <p className="admin-help mt-2">추가 관리가 필요한 학생 수</p>
              </div>
          </article>

          <article className="admin-dashboard-metric">
            <div className="min-w-0">
                <p className="admin-dashboard-metric-label">퇴실</p>
                <p className="admin-dashboard-metric-value text-attend-absent">
                  {summary.withdrawn}
                  <span className="admin-dashboard-metric-unit">명</span>
                </p>
                <p className="admin-help mt-2">현재 운영 대상에서 제외된 학생</p>
              </div>
          </article>
        </section>

        <section className="admin-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="admin-section-title">학생 명단</h2>
              <p className="admin-help mt-1 max-w-2xl">
                검색과 필터를 조합해 학생 상태를 빠르게 파악하고, 우측 패널에서 바로 신규 등록까지 이어서 처리합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${divisionSlug}/admin/seats`}
                prefetch={false}
                className="admin-button"
              >
                <MapPin className="h-4 w-4" />
                좌석 현황
              </Link>

              <button
                type="button"
                onClick={() => router.refresh()}
                className="admin-button"
              >
                <RefreshCcw className="h-4 w-4" />
                새로고침
              </button>

              {canManage ? (
                <button
                  type="button"
                  onClick={openCreatePanel}
                  className="admin-button admin-button-primary"
                >
                  <Plus className="h-4 w-4" />
                  학생 등록
                </button>
              ) : null}
            </div>
          </div>

          {/* DESIGN.md 5.7 — 검색은 최대 320px, 조건 선택은 뒤로 이어 붙인다. */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="relative block w-full md:w-[var(--admin-search-width)] md:shrink-0">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                className="pl-11 pr-11"
                placeholder="이름, 수험번호, 직렬 검색"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    updateListQuery({ q: null });
                  }}
                  className="admin-icon-button absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilterValue);
                updateListQuery({ status: event.target.value });
              }}
              className="w-auto min-w-[160px] flex-1 basis-[160px]"
            >
              <option value="ALL">상태 전체</option>
              {STUDENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={warningFilter}
              onChange={(event) => {
                setWarningFilter(event.target.value as WarningFilterValue);
                updateListQuery({ warning: event.target.value });
              }}
              className="w-auto min-w-[160px] flex-1 basis-[160px]"
            >
              <option value="ALL">경고 단계 전체</option>
              {WARNING_STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {warningLabels?.[option.value] ?? option.label}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => {
                const nextValue = event.target.value as (typeof sortOptions)[number]["value"];
                setSortBy(nextValue);
                updateListQuery({ sort: nextValue });
              }}
              className="w-auto min-w-[160px] flex-1 basis-[160px]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <p className="admin-label">상태 필터</p>
            <div className="admin-choice-group mt-3">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  updateListQuery({ status: null });
                }}
                className="admin-choice-button" data-active={statusFilter === "ALL"} aria-pressed={statusFilter === "ALL"}
              >
                전체
              </button>
              {STUDENT_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(option.value);
                    updateListQuery({ status: option.value });
                  }}
                  className="admin-choice-button" data-active={statusFilter === option.value} aria-pressed={statusFilter === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="admin-label mt-3">빠른 필터</p>
            <div className="admin-choice-group mt-3">
              <button
                type="button"
                onClick={() => {
                  const next = !expiringFilter;
                  setExpiringFilter(next);
                  updateListQuery({ expiring: next ? "true" : null });
                }}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${ expiringFilter ? "bg-rose-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" }`}
              >
                <CalendarX className="h-3.5 w-3.5" />
                수강 만료 임박
              </button>
            </div>
            <p className="admin-label mt-3">직렬 필터</p>
            <div className="admin-choice-group mt-3">
              <button
                type="button"
                onClick={() => {
                  setTrackFilter("ALL");
                  updateListQuery({ track: null });
                }}
                className="admin-choice-button" data-active={trackFilter === "ALL"} aria-pressed={trackFilter === "ALL"}
              >
                전체 직렬
              </button>
              {allTrackOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setTrackFilter(option);
                    updateListQuery({ track: option });
                  }}
                  className="admin-choice-button" data-active={trackFilter === option} aria-pressed={trackFilter === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Users className="h-4 w-4" />
              <span>{filteredStudents.length}명 표시 중</span>
              {search.trim() ? (
                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  검색어 {search.trim()}
                </span>
              ) : null}
              {statusFilter !== "ALL" ? (
                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  {getStudentStatusLabel(statusFilter)}
                </span>
              ) : null}
              {warningFilter !== "ALL" ? (
                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  {warningLabels?.[warningFilter] ?? getWarningStageLabel(warningFilter)}
                </span>
              ) : null}
              {trackFilter !== "ALL" ? (
                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  {trackFilter}
                </span>
              ) : null}
              {expiringFilter ? (
                <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                  만료 임박
                </span>
              ) : null}
            </div>

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={resetFilters}
                className="admin-button admin-button-compact"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                필터 초기화
              </button>
            ) : (
              <p className="admin-help">필터 없이 전체 학생을 보고 있습니다.</p>
            )}
          </div>

          <div className="mt-6 hidden lg:block">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>수험번호</th>
                  <th>이름</th>
                  <th>직렬</th>
                  <th>좌석</th>
                  <th>상태</th>
                  <th>벌점</th>
                  <th>경고 단계</th>
                  <th>등록일</th>
                  <th className="admin-table-amount">상세</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="group text-slate-700 transition hover:bg-white">
                    <td>{student.studentNumber}</td>
                    <td>
                      <div className="font-medium text-slate-950">{student.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="admin-help">{student.phone || "연락처 미등록"}</span>
                        {student.tuitionExempt ? <TuitionExemptBadge reason={student.tuitionExemptReason} /> : null}
                      </div>
                    </td>
                    <td>
                      <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        {student.studyTrack || "미지정"}
                      </span>
                    </td>
                    <td>{student.seatDisplay || "미배정"}</td>
                    <td>
                      <StudentStatusBadge status={student.status} />
                    </td>
                    <td>
                      {(student.demeritPoints ?? toDemeritPoints(student.netPoints))}점
                    </td>
                    <td>
                      <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
                    </td>
                    <td>{formatDate(student.createdAt)}</td>
                    <td className="admin-table-amount">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/${divisionSlug}/admin/students/${student.id}`}
                          prefetch={false}
                          className="admin-button admin-button-compact"
                        >
                          상세 보기
                          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </Link>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(student)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                            title="학생 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 space-y-3 lg:hidden">
            {filteredStudents.map((student) => (
              <article key={student.id} className="admin-section">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="admin-help">{student.studentNumber}</p>
                    <h3 className="admin-section-title">{student.name}</h3>
                  </div>
                  <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StudentStatusBadge status={student.status} />
                  {student.tuitionExempt ? <TuitionExemptBadge reason={student.tuitionExemptReason} /> : null}
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                    직렬 {student.studyTrack || "미지정"}
                  </span>
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                    좌석 {student.seatDisplay || "미배정"}
                  </span>
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                    벌점 {(student.demeritPoints ?? toDemeritPoints(student.netPoints))}점
                  </span>
                </div>

                <p className="admin-help mt-3">{student.phone || "연락처 미등록"}</p>
                <p className="admin-help mt-1">등록일 {formatDate(student.createdAt)}</p>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/${divisionSlug}/admin/students/${student.id}`}
                    prefetch={false}
                    className="admin-button admin-button-primary"
                  >
                    상세 보기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(student)}
                      className="admin-button admin-button-danger-outline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {filteredStudents.length === 0 ? (
            <div className="admin-help mt-6 px-5 py-10 text-center">
              <ShieldAlert className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-700">조건에 맞는 학생이 없습니다.</p>
              <p className="admin-help mt-2">검색어나 필터를 조정해서 다시 확인해 주세요.</p>
            </div>
          ) : null}
        </section>
      </div>

      {canManage ? (
        <SlideOver
          open={isCreateOpen}
          onClose={closeCreatePanel}
          badge="학생 등록"
          title="학생 등록"
          description="학생 정보를 입력하고 저장하면 목록이 즉시 새로고침됩니다."
        >
          <LazyStudentForm
            divisionSlug={divisionSlug}
            mode="create"
            studyTrackOptions={studyTrackOptions}
            seatOptions={seatOptions}
            tuitionPlans={tuitionPlans}
            redirectOnCreate={false}
            onCancel={closeCreatePanel}
            onSuccess={() => {
              closeCreatePanel();
            }}
          />
        </SlideOver>
      ) : null}

      {/* 학생 삭제 확인 모달 */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        badge="학생 삭제"
        title="학생을 삭제하시겠습니까?"
        description="삭제된 학생 데이터는 복구할 수 없습니다."
      >
        {deleteTarget && (
          <form id={`${dialogFormId}-1`} onSubmit={handleDeleteStudent} className="space-y-5">
            <div className="admin-notice admin-notice-danger">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">이 작업은 되돌릴 수 없습니다.</p>
                  <p className="mt-1">
                    학생의 출결 기록, 상벌점, 성적, 수납 내역, 면담 기록 등 모든 관련 데이터가 영구적으로 삭제됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="admin-notice">
              <p className="font-semibold text-slate-950">
                {deleteTarget.name}
                <span className="admin-help ml-2">
                  {deleteTarget.studentNumber}
                </span>
              </p>
              <p className="mt-2">
                직렬 {deleteTarget.studyTrack || "미지정"} · 좌석 {deleteTarget.seatDisplay || "미배정"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StudentStatusBadge status={deleteTarget.status} />
                <WarningStageBadge stage={deleteTarget.warningStage} label={deleteTarget.warningStageLabel} />
              </div>
            </div>

            <DialogActions>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                취소
              </button>
              <button form={`${dialogFormId}-1`}
                type="submit"
                disabled={isDeleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {isDeleting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                삭제 확정
              </button>
            </DialogActions>
          </form>
        )}
      </Modal>
    </>
  );
}
