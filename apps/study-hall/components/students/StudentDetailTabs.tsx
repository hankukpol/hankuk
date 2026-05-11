"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CalendarDays, CreditCard, LoaderCircle, MessageSquareWarning, Plus, Star, Target } from "lucide-react";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { RefundModal } from "@/components/payments/RefundModal";
import { Modal } from "@/components/ui/Modal";
import { getInterviewResultTypeClasses, getInterviewResultTypeLabel } from "@/lib/interview-meta";
import { getLeaveStatusClasses, getLeaveStatusLabel, getLeaveTypeLabel } from "@/lib/leave-meta";
import { formatPaymentMethod } from "@/lib/payment-meta";
import type { StudentAttendanceHistoryItem } from "@/lib/services/attendance.service";
import type { ExamTypeItem, StudentExamResultItem } from "@/lib/services/exam.service";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { LeavePermissionItem } from "@/lib/services/leave.service";
import type { PaymentCategoryItem, PaymentItem } from "@/lib/services/payment.service";
import type { PointRecordItem, PointRuleItem } from "@/lib/services/point.service";
import type { ScoreTargetItem } from "@/lib/services/score-target.service";
import type { StudentDashboardData } from "@/lib/services/student-dashboard.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";

type StudentDetailTabId = "attendance" | "points" | "exams" | "payments" | "interviews" | "study-time";

type StudentDetailTabsProps = {
  divisionSlug: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  canManageScoreTargets: boolean;
  canEdit: boolean;
  attendanceManagementEnabled: boolean;
  leaveManagementEnabled: boolean;
  interviewManagementEnabled: boolean;
  pointManagementEnabled: boolean;
  examManagementEnabled: boolean;
  paymentManagementEnabled: boolean;
  activeTab: StudentDetailTabId;
  attendanceSummary: StudentDashboardData["summary"];
  weeklyAttendance: StudentDashboardData["weeklyAttendance"];
  attendanceHistory: StudentAttendanceHistoryItem[];
  leavePermissions: LeavePermissionItem[];
  pointRecords: PointRecordItem[];
  examResults: StudentExamResultItem[];
  scoreTargets: ScoreTargetItem[];
  availableScoreTargetExamTypes: Array<Pick<ExamTypeItem, "id" | "name" | "studyTrack">>;
  paymentRecords: PaymentItem[];
  paymentCategories: PaymentCategoryItem[];
  tuitionPlans: TuitionPlanItem[];
  defaultPaymentAmount?: number | null;
  defaultPaymentNotes?: string | null;
  pointRules: PointRuleItem[];
  interviews: InterviewItem[];
};

const tabSectionFallback = () => (
  <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-500">
    불러오는 중...
  </div>
);

const ScoreTargetPanel = dynamic(
  () => import("@/components/exams/ScoreTargetPanel").then((mod) => mod.ScoreTargetPanel),
  { ssr: false, loading: tabSectionFallback },
);

const ExamScoreChart = dynamic(
  () => import("@/components/exams/ExamScoreChart").then((mod) => mod.ExamScoreChart),
  { ssr: false, loading: tabSectionFallback },
);

const StudyTimeStats = dynamic(
  () => import("@/components/study-time/StudyTimeStats").then((mod) => mod.StudyTimeStats),
  { ssr: false, loading: tabSectionFallback },
);

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("ko-KR");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFullDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getKstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getMonthStartDateKey(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

function addDateDays(dateKey: string, offsetDays: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

function formatDateWithWeekday(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

type WeeklyAttendanceCellStatus =
  StudentDashboardData["weeklyAttendance"]["rows"][number]["cells"][number]["status"];

function getAttendanceStatusClasses(status: WeeklyAttendanceCellStatus) {
  switch (status) {
    case "PRESENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "TARDY":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ABSENT":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "EXCUSED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "UPCOMING":
    case "NOT_APPLICABLE":
      return "border-slate-200 bg-slate-50 text-slate-500";
    case "OFF":
      return "border-slate-200 bg-slate-100 text-slate-500";
    default:
      return "border-orange-200 bg-orange-50 text-orange-700";
  }
}

function getAttendanceHistoryStatusClasses(status: StudentAttendanceHistoryItem["status"]) {
  return getAttendanceStatusClasses(status);
}

function getAttendanceHistoryStatusLabel(status: StudentAttendanceHistoryItem["status"]) {
  switch (status) {
    case "PRESENT":
      return "출석";
    case "TARDY":
      return "지각";
    case "ABSENT":
      return "결석";
    case "EXCUSED":
      return "사유결석";
    case "HOLIDAY":
      return "휴무";
    case "HALF_HOLIDAY":
      return "반휴";
    case "NOT_APPLICABLE":
      return "해당없음";
    default:
      return status;
  }
}

const attendanceHistoryFilters = [
  { value: "ALL", label: "전체" },
  { value: "ABSENT", label: "결석" },
  { value: "EXCUSED", label: "사유결석" },
  { value: "HOLIDAY", label: "휴무" },
  { value: "HALF_HOLIDAY", label: "반휴" },
  { value: "REASONED", label: "사유 있음" },
] as const;

type AttendanceHistoryFilter = (typeof attendanceHistoryFilters)[number]["value"];

export function StudentDetailTabs({
  divisionSlug,
  studentId,
  studentName,
  studentNumber,
  canManageScoreTargets,
  canEdit,
  attendanceManagementEnabled,
  leaveManagementEnabled,
  interviewManagementEnabled,
  pointManagementEnabled,
  examManagementEnabled,
  paymentManagementEnabled,
  activeTab,
  attendanceSummary,
  weeklyAttendance,
  attendanceHistory,
  leavePermissions,
  pointRecords,
  examResults,
  scoreTargets,
  availableScoreTargetExamTypes,
  paymentRecords,
  paymentCategories,
  tuitionPlans,
  defaultPaymentAmount,
  defaultPaymentNotes,
  pointRules,
  interviews,
}: StudentDetailTabsProps) {
  const router = useRouter();

  // Payment add/refund state
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState(defaultPaymentAmount != null ? String(defaultPaymentAmount) : "");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [paymentNotes, setPaymentNotes] = useState(defaultPaymentNotes ?? "");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Exam type filter state
  const examTypeNames = Array.from(new Set(examResults.map((r) => r.examTypeName)));
  const [selectedExamTypeName, setSelectedExamTypeName] = useState<string>(examTypeNames[0] ?? "");
  const filteredExamResults = examResults.filter((r) => r.examTypeName === selectedExamTypeName);

  // Points add state
  const [isAddPointsOpen, setIsAddPointsOpen] = useState(false);
  const [pointRuleId, setPointRuleId] = useState("");
  const [manualPoints, setManualPoints] = useState("");
  const [pointsNotes, setPointsNotes] = useState("");
  const [isSubmittingPoints, setIsSubmittingPoints] = useState(false);

  const selectedRule = pointRules.find((r) => r.id === pointRuleId) ?? null;
  const [attendanceDateFrom, setAttendanceDateFrom] = useState(() =>
    getMonthStartDateKey(getKstDateKey()),
  );
  const [attendanceDateTo, setAttendanceDateTo] = useState(() => getKstDateKey());
  const [attendanceHistoryFilter, setAttendanceHistoryFilter] =
    useState<AttendanceHistoryFilter>("ALL");
  const weeklyDateRows = weeklyAttendance.dates.map((date, dateIndex) => ({
    ...date,
    cells: weeklyAttendance.rows.map((row) => ({
      periodId: row.periodId,
      periodName: row.periodName,
      label: row.label,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.cells[dateIndex].status,
      statusLabel: row.cells[dateIndex].label,
      reason: row.cells[dateIndex].reason,
    })),
  }));
  const attendanceRangeFrom =
    attendanceDateFrom && attendanceDateTo && attendanceDateFrom > attendanceDateTo
      ? attendanceDateTo
      : attendanceDateFrom;
  const attendanceRangeTo =
    attendanceDateFrom && attendanceDateTo && attendanceDateFrom > attendanceDateTo
      ? attendanceDateFrom
      : attendanceDateTo;
  const attendanceHistoryInRange = attendanceHistory.filter((record) => {
    if (attendanceRangeFrom && record.date < attendanceRangeFrom) {
      return false;
    }

    if (attendanceRangeTo && record.date > attendanceRangeTo) {
      return false;
    }

    return true;
  });
  const filteredAttendanceHistory = attendanceHistoryInRange.filter((record) => {
    if (attendanceHistoryFilter === "ALL") {
      return true;
    }

    if (attendanceHistoryFilter === "REASONED") {
      return Boolean(record.reason?.trim());
    }

    return record.status === attendanceHistoryFilter;
  });
  const attendanceRangeLabel =
    attendanceRangeFrom || attendanceRangeTo
      ? `${attendanceRangeFrom || "처음"} ~ ${attendanceRangeTo || "오늘"}`
      : "전체 기간";

  function closeAddPayment() {
    if (isSubmittingPayment) return;
    setIsAddPaymentOpen(false);
    setPaymentTypeId("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentAmount(defaultPaymentAmount != null ? String(defaultPaymentAmount) : "");
    setPaymentMethod("card");
    setPaymentNotes(defaultPaymentNotes ?? "");
    setSelectedPlanId("");
  }

  function closeAddPoints() {
    if (isSubmittingPoints) return;
    setIsAddPointsOpen(false);
    setPointRuleId("");
    setManualPoints("");
    setPointsNotes("");
  }

  function applyAttendanceRangePreset(preset: "month" | "last7" | "last30" | "all") {
    const today = getKstDateKey();

    if (preset === "month") {
      setAttendanceDateFrom(getMonthStartDateKey(today));
      setAttendanceDateTo(today);
      return;
    }

    if (preset === "last7") {
      setAttendanceDateFrom(addDateDays(today, -6));
      setAttendanceDateTo(today);
      return;
    }

    if (preset === "last30") {
      setAttendanceDateFrom(addDateDays(today, -29));
      setAttendanceDateTo(today);
      return;
    }

    setAttendanceDateFrom("");
    setAttendanceDateTo("");
  }

  async function handleAddPoints(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingPoints(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          ruleId: pointRuleId || null,
          points: pointRuleId ? null : parseInt(manualPoints, 10),
          notes: pointsNotes || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "상벌점 등록에 실패했습니다.");
      }

      toast.success("상벌점이 등록되었습니다.");
      closeAddPoints();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 등록에 실패했습니다.");
    } finally {
      setIsSubmittingPoints(false);
    }
  }

  async function handleAddPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingPayment(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          paymentTypeId,
          amount: parseInt(paymentAmount, 10),
          paymentDate,
          method: paymentMethod,
          notes: paymentNotes || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "수납 등록에 실패했습니다.");
      }

      toast.success("수납이 등록되었습니다.");
      closeAddPayment();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 등록에 실패했습니다.");
    } finally {
      setIsSubmittingPayment(false);
    }
  }

  if (activeTab === "attendance") {
    if (!attendanceManagementEnabled) {
      return (
        <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
          출결 관리 기능이 현재 비활성화되어 있습니다.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-slate-700">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-semibold">출결 현황</span>
        </div>

        <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">이번 달 출석률</th>
                <th className="border-b border-slate-200 px-4 py-3">월간 출석</th>
                <th className="border-b border-slate-200 px-4 py-3">주간 출석</th>
                <th className={`border-b border-slate-200 px-4 py-3 ${leaveManagementEnabled ? "" : "hidden"}`}>
                  외출/휴가 기록
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-4 text-2xl font-bold text-slate-950">
                  {attendanceSummary.monthlyAttendanceRate}%
                </td>
                <td className="px-4 py-4 text-2xl font-bold text-slate-950">
                  {attendanceSummary.monthlyAttendedCount}/{attendanceSummary.monthlyExpectedCount}
                </td>
                <td className="px-4 py-4 text-2xl font-bold text-slate-950">
                  {attendanceSummary.weeklyAttendedCount}/{attendanceSummary.weeklyExpectedCount}
                </td>
                <td className={`px-4 py-4 text-2xl font-bold text-slate-950 ${leaveManagementEnabled ? "" : "hidden"}`}>
                  {leavePermissions.length}건
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">이번 주 출결표</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 w-[120px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3">
                    날짜
                  </th>
                  {weeklyAttendance.rows.map((row) => (
                    <th key={row.periodId} className="min-w-[120px] border-b border-r border-slate-200 px-3 py-3 last:border-r-0">
                      <span className="block text-slate-900">{row.periodName}</span>
                      <span className="mt-1 block font-normal text-slate-500">
                        {row.startTime}-{row.endTime}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeklyDateRows.map((row) => (
                  <tr key={row.date} className={row.isToday ? "bg-[color-mix(in_srgb,var(--division-color)_6%,white)]" : ""}>
                    <th className="sticky left-0 z-10 border-b border-r border-slate-100 bg-inherit px-4 py-3 text-left align-top">
                      <span className="block font-semibold text-slate-950">{formatDateWithWeekday(row.date)}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {row.isToday ? "오늘" : row.isOperatingDay ? "운영" : "휴무"}
                      </span>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={`${row.date}-${cell.periodId}`} className="border-b border-r border-slate-100 px-3 py-3 align-top last:border-r-0">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getAttendanceStatusClasses(cell.status)}`}>
                          {cell.statusLabel}
                        </span>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {cell.reason || `${cell.startTime}-${cell.endTime}`}
                        </p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
          <div className="space-y-3 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">출결 상세 이력</p>
              <p className="mt-1 text-xs text-slate-500">
                결석, 사유결석, 휴무와 사유 작성 및 수정 시점을 확인합니다.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  시작일
                  <input
                    type="date"
                    value={attendanceDateFrom}
                    onChange={(event) => setAttendanceDateFrom(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  종료일
                  <input
                    type="date"
                    value={attendanceDateTo}
                    onChange={(event) => setAttendanceDateTo(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "month" as const, label: "이번 달" },
                  { key: "last7" as const, label: "최근 7일" },
                  { key: "last30" as const, label: "최근 30일" },
                  { key: "all" as const, label: "전체" },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyAttendanceRangePreset(preset.key)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <p className="text-xs font-medium text-slate-500">
                {attendanceRangeLabel} · {filteredAttendanceHistory.length}건 표시
                {filteredAttendanceHistory.length !== attendanceHistoryInRange.length
                  ? ` / 기간 내 ${attendanceHistoryInRange.length}건`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {attendanceHistoryFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setAttendanceHistoryFilter(filter.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      attendanceHistoryFilter === filter.value
                        ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3">날짜</th>
                  <th className="border-b border-slate-200 px-4 py-3">교시</th>
                  <th className="border-b border-slate-200 px-4 py-3">상태</th>
                  <th className="border-b border-slate-200 px-4 py-3">사유</th>
                  <th className="border-b border-slate-200 px-4 py-3">작성 / 수정</th>
                  <th className="border-b border-slate-200 px-4 py-3">처리자</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendanceHistory.length > 0 ? (
                  filteredAttendanceHistory.map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{formatDate(record.date)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="font-medium">{record.periodName}</span>
                        {record.periodLabel ? (
                          <span className="ml-1 text-xs text-slate-400">{record.periodLabel}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getAttendanceHistoryStatusClasses(record.status)}`}>
                          {getAttendanceHistoryStatusLabel(record.status)}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-slate-700">
                        {record.reason || <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-xs leading-5 text-slate-500">
                        <div>작성 {formatFullDateTime(record.createdAt)}</div>
                        <div>수정 {formatFullDateTime(record.updatedAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.recordedByName || "시스템"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      조건에 맞는 출결 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {leaveManagementEnabled ? (
          <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">최근 외출/휴가</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3">날짜</th>
                    <th className="border-b border-slate-200 px-4 py-3">유형</th>
                    <th className="border-b border-slate-200 px-4 py-3">상태</th>
                    <th className="border-b border-slate-200 px-4 py-3">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {leavePermissions.length > 0 ? (
                    leavePermissions.slice(0, 5).map((permission) => (
                      <tr key={permission.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{formatDate(permission.date)}</td>
                        <td className="px-4 py-3 text-slate-700">{getLeaveTypeLabel(permission.type)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getLeaveStatusClasses(permission.status)}`}>
                            {getLeaveStatusLabel(permission.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{permission.reason || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                        등록된 외출/휴가 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  if (activeTab === "points") {
    if (!pointManagementEnabled) {
      return (
        <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
          상벌점 관리 기능이 현재 비활성화되어 있습니다.
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600">
            <Star className="h-4 w-4" />
            <span className="text-sm font-medium">상벌점</span>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsAddPointsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--division-color)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              상벌점 추가
            </button>
          )}
        </div>

        {pointRecords.length > 0 ? (
          <div className="space-y-3">
            {pointRecords.map((record) => (
              <article
                key={record.id}
                className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <PointCategoryBadge category={record.category} />
                  <PointValueBadge points={record.points} />
                  <span className="text-xs text-slate-500">{formatDateTime(record.date)}</span>
                </div>
                <p className="mt-3 text-xl font-bold text-slate-950">
                  {record.ruleName || "직접 기록"}
                </p>
                <p className="mt-1 text-sm text-slate-600">기록자 {record.recordedByName}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {record.notes || "기록 메모가 없습니다."}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
            등록된 상벌점 기록이 없습니다.
          </div>
        )}

        <Modal
          open={isAddPointsOpen}
          onClose={closeAddPoints}
          badge="상벌점"
          title="상벌점 추가"
          description="규칙을 선택하거나 점수를 직접 입력하여 상벌점을 기록합니다."
        >
          <form onSubmit={handleAddPoints} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">규칙 선택</label>
              <select
                value={pointRuleId}
                onChange={(e) => {
                  setPointRuleId(e.target.value);
                  setManualPoints("");
                }}
                className="mt-1.5 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
              >
                <option value="">직접 점수 입력</option>
                {pointRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name} · {rule.points > 0 ? "+" : ""}{rule.points}점
                  </option>
                ))}
              </select>
            </div>

            {pointRuleId && selectedRule ? (
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <PointCategoryBadge category={selectedRule.category} />
                  <PointValueBadge points={selectedRule.points} />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selectedRule.name}</p>
                {selectedRule.description && (
                  <p className="mt-1 text-xs text-slate-500">{selectedRule.description}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  점수 <span className="text-slate-400">(음수 = 벌점)</span>
                </label>
                <input
                  type="number"
                  value={manualPoints}
                  onChange={(e) => setManualPoints(e.target.value)}
                  required={!pointRuleId}
                  placeholder="예: 5 또는 -3"
                  className="mt-1.5 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">메모</label>
              <textarea
                value={pointsNotes}
                onChange={(e) => setPointsNotes(e.target.value)}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
                placeholder="메모를 입력하세요"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeAddPoints}
                disabled={isSubmittingPoints}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmittingPoints}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {isSubmittingPoints && <LoaderCircle className="h-4 w-4 animate-spin" />}
                상벌점 등록
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  if (activeTab === "exams") {
    if (!examManagementEnabled) {
      return (
        <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
          시험 관리 기능이 현재 비활성화되어 있습니다.
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-600">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">성적</span>
          </div>
          {examTypeNames.length > 0 && (
            <select
              value={selectedExamTypeName}
              onChange={(e) => setSelectedExamTypeName(e.target.value)}
              className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-950"
            >
              {examTypeNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        <ScoreTargetPanel
          divisionSlug={divisionSlug}
          studentId={studentId}
          initialTargets={scoreTargets}
          availableExamTypes={availableScoreTargetExamTypes}
          canEdit={canManageScoreTargets}
        />

        <ExamScoreChart results={filteredExamResults} />

        {filteredExamResults.length > 0 ? (
          <div className="space-y-4">
            {filteredExamResults.map((exam) => (
              <article
                key={exam.id}
                className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{exam.examTypeName}</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">
                      {exam.examRound}회차
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">시험일 {formatDate(exam.examDate)}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                      <p className="text-sm text-slate-500">총점</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">
                        {exam.totalScore ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                      <p className="text-sm text-slate-500">반 석차</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">
                        {exam.rankInClass ? `${exam.rankInClass}등` : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {exam.subjects.map((subject) => (
                    <div
                      key={`${exam.id}-${subject.subjectId}`}
                      className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3"
                    >
                      <p className="text-sm font-medium text-slate-900">{subject.name}</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">
                        {subject.score ?? "-"}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {exam.notes || "등록된 시험 메모가 없습니다."}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
            {examResults.length === 0 ? "등록된 시험 성적이 없습니다." : "해당 시험 성적이 없습니다."}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "study-time") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-sm font-medium">학습 시간</span>
        </div>
        <StudyTimeStats divisionSlug={divisionSlug} studentId={studentId} />
      </div>
    );
  }

  if (activeTab === "payments") {
    if (!paymentManagementEnabled) {
      return (
        <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
          수납 관리 기능이 현재 비활성화되어 있습니다.
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600">
            <CreditCard className="h-4 w-4" />
            <span className="text-sm font-medium">수납</span>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRefundOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
              >
                환불 처리
              </button>
              <button
                type="button"
                onClick={() => setIsAddPaymentOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--division-color)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                수납 추가
              </button>
            </div>
          )}
        </div>

        {paymentRecords.length > 0 ? (
          <div className="overflow-x-auto rounded-[10px] border border-slate-200-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-3 font-medium">유형</th>
                  <th className="px-3 py-3 font-medium">금액</th>
                  <th className="px-3 py-3 font-medium">납부일</th>
                  <th className="px-3 py-3 font-medium">수단</th>
                  <th className="px-3 py-3 font-medium">기록자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentRecords.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-3 py-4">
                      <p className="font-medium text-slate-900">{payment.paymentTypeName}</p>
                      <p className="mt-1 text-xs text-slate-500">{payment.notes || "메모 없음"}</p>
                    </td>
                    <td className={`px-3 py-4 font-semibold ${payment.amount < 0 ? "text-rose-600" : "text-slate-950"}`}>
                      {payment.amount < 0 ? "-" : ""}{formatCurrency(Math.abs(payment.amount))}원
                    </td>
                    <td className="px-3 py-4 text-slate-600">{formatDate(payment.paymentDate)}</td>
                    <td className="px-3 py-4 text-slate-600">{formatPaymentMethod(payment.method)}</td>
                    <td className="px-3 py-4 text-slate-600">{payment.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
            등록된 수납 기록이 없습니다.
          </div>
        )}

        <Modal
          open={isAddPaymentOpen}
          onClose={closeAddPayment}
          badge="수납"
          title="수납 추가"
          description="학생의 수납 내역을 등록합니다."
        >
          <form onSubmit={handleAddPayment} className="space-y-4">
            {tuitionPlans.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">등록 기간 및 금액</p>
                <div className="grid grid-cols-2 gap-2">
                  {tuitionPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setPaymentAmount(String(plan.amount));
                        setPaymentNotes(plan.name);
                      }}
                      className={`rounded-[10px] border p-3 text-left transition ${
                        selectedPlanId === plan.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:border-slate-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-semibold">{plan.name}</p>
                        <p className="shrink-0 text-xs font-bold">
                          {new Intl.NumberFormat("ko-KR").format(plan.amount)}원
                        </p>
                      </div>
                      <p className={`mt-0.5 text-xs ${selectedPlanId === plan.id ? "text-slate-300" : "text-slate-400"}`}>
                        {plan.durationDays}일
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">수납 유형 *</label>
              <select
                value={paymentTypeId}
                onChange={(e) => setPaymentTypeId(e.target.value)}
                required
                className="mt-1.5 w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
              >
                <option value="">선택해 주세요</option>
                {paymentCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">납부일 *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="mt-1.5 w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">납부 금액 *</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
                min="1"
                placeholder="0"
                className="mt-1.5 w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">납부 방식</label>
              <div className="mt-1.5">
                <PaymentMethodSelect
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  required
                  selectClassName="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
                  inputClassName="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">메모</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
                placeholder="메모를 입력하세요"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeAddPayment}
                disabled={isSubmittingPayment}
                className="rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmittingPayment}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {isSubmittingPayment && <LoaderCircle className="h-4 w-4 animate-spin" />}
                수납 등록
              </button>
            </div>
          </form>
        </Modal>

        <RefundModal
          open={isRefundOpen}
          onClose={() => setIsRefundOpen(false)}
          divisionSlug={divisionSlug}
          student={{ id: studentId, name: studentName, studentNumber }}
          students={[]}
          paymentCategories={paymentCategories}
          paymentRecords={paymentRecords}
          onSuccess={() => router.refresh()}
        />
      </div>
    );
  }

  if (!interviewManagementEnabled) {
    return (
      <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
        면담 관리 기능이 현재 비활성화되어 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-slate-600">
        <MessageSquareWarning className="h-4 w-4" />
        <span className="text-sm font-medium">면담</span>
      </div>

      {interviews.length > 0 ? (
        <div className="space-y-3">
          {interviews.map((interview) => (
            <article
              key={interview.id}
              className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getInterviewResultTypeClasses(interview.resultType)}`}
                >
                  {getInterviewResultTypeLabel(interview.resultType)}
                </span>
                <span className="text-xs text-slate-500">{formatDate(interview.date)}</span>
                <span className="text-xs text-slate-500">기록자 {interview.createdByName}</span>
              </div>
              <p className="mt-3 text-xl font-bold text-slate-950">{interview.reason}</p>
              <p className="mt-2 text-sm text-slate-600">{interview.trigger || "트리거 기록 없음"}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {interview.content || "면담 내용이 없습니다."}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                후속 조치: {interview.result || "기록 없음"}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
          등록된 면담 기록이 없습니다.
        </div>
      )}
    </div>
  );
}
