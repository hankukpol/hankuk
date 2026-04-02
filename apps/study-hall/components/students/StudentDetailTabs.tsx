"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CalendarDays, CreditCard, LoaderCircle, MessageSquareWarning, Plus, Star, Target } from "lucide-react";
import { toast } from "@/lib/sonner";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { RefundModal } from "@/components/payments/RefundModal";
import { AttendanceCalendar } from "@/components/student-view/AttendanceCalendar";
import { Modal } from "@/components/ui/Modal";
import { getInterviewResultTypeClasses, getInterviewResultTypeLabel } from "@/lib/interview-meta";
import { getLeaveStatusClasses, getLeaveStatusLabel, getLeaveTypeLabel } from "@/lib/leave-meta";
import { formatPaymentMethod } from "@/lib/payment-meta";
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
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

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
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-slate-600">
          <CalendarDays className="h-4 w-4" />
          <span className="text-sm font-medium">출결 현황</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">이번 달 출석률</p>
            <p className="mt-3 text-2xl font-bold text-slate-950">
              {attendanceSummary.monthlyAttendanceRate}%
            </p>
            </article>
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">월간 출석</p>
            <p className="mt-3 text-2xl font-bold text-slate-950">
              {attendanceSummary.monthlyAttendedCount}/{attendanceSummary.monthlyExpectedCount}
            </p>
            </article>
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">주간 출석</p>
            <p className="mt-3 text-2xl font-bold text-slate-950">
              {attendanceSummary.weeklyAttendedCount}/{attendanceSummary.weeklyExpectedCount}
            </p>
            </article>
          <article
            className={`rounded-[10px] border border-slate-200-slate-200 bg-white p-4 ${
              leaveManagementEnabled ? "" : "hidden"
            }`}
          >
            <p className="text-sm text-slate-500">외출/휴가 기록</p>
            <p className="mt-3 text-2xl font-bold text-slate-950">{leavePermissions.length}건</p>
          </article>
        </div>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
          <AttendanceCalendar weeklyAttendance={weeklyAttendance} />
          </div>

        {leaveManagementEnabled ? (
          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">최근 외출/휴가</p>
          {leavePermissions.length > 0 ? (
            <div className="mt-4 space-y-3">
              {leavePermissions.slice(0, 5).map((permission) => (
                <div
                  key={permission.id}
                  className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {getLeaveTypeLabel(permission.type)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getLeaveStatusClasses(permission.status)}`}
                    >
                      {getLeaveStatusLabel(permission.status)}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(permission.date)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {permission.reason || "사유 없음"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
              등록된 외출/휴가 기록이 없습니다.
            </div>
          )}
          </div>
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
