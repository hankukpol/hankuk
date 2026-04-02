"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Ban, CircleAlert, LoaderCircle, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "@/lib/sonner";

import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { StudentStatusBadge, TuitionExemptBadge, WarningStageBadge } from "@/components/students/StudentBadges";
import { StudentDetailTabs } from "@/components/students/StudentDetailTabs";
import { Modal } from "@/components/ui/Modal";
import type { ExamTypeItem, StudentExamResultItem } from "@/lib/services/exam.service";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { LeavePermissionItem } from "@/lib/services/leave.service";
import type { PaymentCategoryItem, PaymentItem } from "@/lib/services/payment.service";
import type { PointRecordItem, PointRuleItem } from "@/lib/services/point.service";
import type { ScoreTargetItem } from "@/lib/services/score-target.service";
import type { SeatOptionItem } from "@/lib/services/seat.service";
import type { StudentDashboardData } from "@/lib/services/student-dashboard.service";
import type { StudentDetail } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";

type WarningThresholds = {
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
};

type StudentDetailViewProps = {
  divisionSlug: string;
  initialStudent: StudentDetail;
  canEdit: boolean;
  studyTrackOptions: string[];
  seatOptions: SeatOptionItem[];
  tuitionPlans: TuitionPlanItem[];
  warningThresholds: WarningThresholds;
  attendanceManagementEnabled: boolean;
  leaveManagementEnabled: boolean;
  interviewManagementEnabled: boolean;
  warningManagementEnabled: boolean;
  pointManagementEnabled: boolean;
  examManagementEnabled: boolean;
  paymentManagementEnabled: boolean;
  attendanceSummary: StudentDashboardData["summary"];
  weeklyAttendance: StudentDashboardData["weeklyAttendance"];
  leavePermissions: LeavePermissionItem[];
  pointRecords: PointRecordItem[];
  examResults: StudentExamResultItem[];
  scoreTargets: ScoreTargetItem[];
  availableScoreTargetExamTypes: Array<Pick<ExamTypeItem, "id" | "name" | "studyTrack">>;
  paymentRecords: PaymentItem[];
  paymentCategories: PaymentCategoryItem[];
  pointRules: PointRuleItem[];
  interviews: InterviewItem[];
};

const tabs = [
  { id: "attendance", label: "출결 현황" },
  { id: "points", label: "상벌점" },
  { id: "exams", label: "성적" },
  { id: "payments", label: "수납" },
  { id: "interviews", label: "면담" },
  { id: "study-time", label: "학습 시간" },
] as const;

const studentFormFallback = () => (
  <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
    학생 정보를 불러오는 중입니다.
  </div>
);

const StudentForm = dynamic(
  () => import("@/components/students/StudentForm").then((mod) => mod.StudentForm),
  { ssr: false, loading: studentFormFallback },
);

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("ko-KR");
}

function formatCurrency(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value.toLocaleString("ko-KR")}원`;
}

export function StudentDetailView({
  divisionSlug,
  initialStudent,
  canEdit,
  studyTrackOptions,
  seatOptions,
  tuitionPlans,
  warningThresholds,
  attendanceManagementEnabled,
  leaveManagementEnabled,
  interviewManagementEnabled,
  warningManagementEnabled,
  pointManagementEnabled,
  examManagementEnabled,
  paymentManagementEnabled,
  attendanceSummary,
  weeklyAttendance,
  leavePermissions,
  pointRecords,
  examResults,
  scoreTargets,
  availableScoreTargetExamTypes,
  paymentRecords,
  paymentCategories,
  pointRules,
  interviews,
}: StudentDetailViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("attendance");
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawnNote, setWithdrawnNote] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isRefundEnabled, setIsRefundEnabled] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("bank-transfer");
  const [refundNotes, setRefundNotes] = useState("");
  const [memo, setMemo] = useState(initialStudent.memo ?? "");
  const [memoDraft, setMemoDraft] = useState(initialStudent.memo ?? "");
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const availableTabs = tabs.filter((tab) => {
    if (tab.id === "attendance") {
      return attendanceManagementEnabled;
    }

    if (tab.id === "interviews") {
      return interviewManagementEnabled;
    }

    if (tab.id === "points") {
      return pointManagementEnabled;
    }

    if (tab.id === "exams") {
      return examManagementEnabled;
    }

    if (tab.id === "payments") {
      return paymentManagementEnabled;
    }

    return true;
  });

  // 경고 단계 조정
  const [isWarnAdjustOpen, setIsWarnAdjustOpen] = useState(false);
  const [selectedWarnTarget, setSelectedWarnTarget] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const warnTargets = [
    { stage: "NORMAL", label: "정상", threshold: 0 },
    { stage: "WARNING_1", label: "1차 경고", threshold: warningThresholds.warnLevel1 },
    { stage: "WARNING_2", label: "2차 경고", threshold: warningThresholds.warnLevel2 },
    { stage: "INTERVIEW", label: "면담 대상", threshold: warningThresholds.warnInterview },
    { stage: "WITHDRAWAL", label: "퇴실 대상", threshold: warningThresholds.warnWithdraw },
  ];

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id ?? "study-time");
    }
  }, [activeTab, availableTabs]);

  async function handleWarnAdjust() {
    const target = warnTargets.find((t) => t.stage === selectedWarnTarget);
    if (!target) return;
    const delta = target.threshold - initialStudent.netPoints;
    if (delta === 0) {
      setIsWarnAdjustOpen(false);
      return;
    }
    // delta > 0: 벌점 추가 (points = -delta), delta < 0: 상점 추가 (points = |delta|)
    const pointsToAdd = -delta;
    setIsAdjusting(true);
    try {
      const res = await fetch(`/api/${divisionSlug}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: initialStudent.id,
          points: pointsToAdd,
          notes: `경고 단계 수동 조정 (목표: ${target.label})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "상벌점 기록에 실패했습니다.");
      toast.success(`경고 단계를 ${target.label}(으)로 조정했습니다.`);
      setIsWarnAdjustOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "조정에 실패했습니다.");
    } finally {
      setIsAdjusting(false);
    }
  }

  async function handleReactivate() {
    setIsReactivating(true);
    try {
      const response = await fetch(
        `/api/${divisionSlug}/students/${initialStudent.id}/reactivate`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "재입실 처리에 실패했습니다.");
      }
      toast.success("재입실 처리되었습니다. 좌석 배정 등 추가 설정을 진행해주세요.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "재입실 처리에 실패했습니다.");
    } finally {
      setIsReactivating(false);
    }
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDeleteConfirming(true);
    try {
      const response = await fetch(
        `/api/${divisionSlug}/students/${initialStudent.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "학생 삭제에 실패했습니다.");
      }
      toast.success("학생을 삭제했습니다.");
      router.push(`/${divisionSlug}/admin/students`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 삭제에 실패했습니다.");
    } finally {
      setIsDeleteConfirming(false);
    }
  }

  function closeWithdrawPanel() {
    if (isWithdrawing) {
      return;
    }

    setIsWithdrawOpen(false);
    setWithdrawnNote("");
    setIsRefundEnabled(false);
    setRefundAmount("");
    setRefundMethod("bank-transfer");
    setRefundNotes("");
  }

  async function handleWithdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsWithdrawing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/students/${initialStudent.id}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          withdrawnNote,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "퇴실 처리에 실패했습니다.");
      }

      if (paymentManagementEnabled && isRefundEnabled) {
        const amount = parseInt(refundAmount.replaceAll(",", ""), 10);
        const refundCategory = paymentCategories.find((c) => c.name === "환불");
        if (amount > 0 && refundCategory) {
          const refundResponse = await fetch(`/api/${divisionSlug}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: initialStudent.id,
              paymentTypeId: refundCategory.id,
              amount: amount * -1,
              paymentDate: new Date().toISOString().slice(0, 10),
              method: refundMethod,
              notes: refundNotes || null,
            }),
          });
          if (!refundResponse.ok) {
            toast.error("환불 기록 등록에 실패했습니다. 수납 관리에서 수동으로 등록해주세요.");
          }
        }
      }

      toast.success("퇴실 처리했습니다.");
      closeWithdrawPanel();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "퇴실 처리에 실패했습니다.");
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function saveMemo(nextMemo: string) {
    const normalized = nextMemo.trim();
    const current = memo.trim();

    if (normalized === current) {
      setMemoDraft(memo);
      setIsEditingMemo(false);
      return;
    }

    setIsSavingMemo(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/students/${initialStudent.id}/memo`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memo: normalized || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "메모 저장에 실패했습니다.");
      }

      setMemo(data.student.memo ?? "");
      setMemoDraft(data.student.memo ?? "");
      setIsEditingMemo(false);
      toast.success("메모를 저장했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "메모 저장에 실패했습니다.");
      setMemoDraft(memo);
    } finally {
      setIsSavingMemo(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[10px] border border-slate-200-black/5 bg-white shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="grid gap-5 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              학생 상세
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
              {initialStudent.name}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{initialStudent.studentNumber}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StudentStatusBadge status={initialStudent.status} />
              <WarningStageBadge stage={initialStudent.warningStage} />
              {initialStudent.tuitionExempt ? (
                <TuitionExemptBadge reason={initialStudent.tuitionExemptReason} />
              ) : null}
              {canEdit && warningManagementEnabled && pointManagementEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWarnTarget(initialStudent.warningStage);
                    setIsWarnAdjustOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  경고 조정
                </button>
              )}
              <span className="inline-flex rounded-full border border-slate-200-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                직렬 {initialStudent.studyTrack || "미지정"}
              </span>
              <span className="inline-flex rounded-full border border-slate-200-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                좌석 {initialStudent.seatDisplay || "미배정"}
              </span>
            </div>

            {initialStudent.tuitionExempt ? (
              <div className="mt-5 rounded-[10px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-900">
                <p className="font-semibold">수납 면제 학생</p>
                <p className="mt-1">
                  {initialStudent.tuitionExemptReason || "면제 사유가 아직 입력되지 않았습니다."}
                </p>
              </div>
            ) : null}

            <div className="mt-5 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
              <p className="text-sm font-medium text-slate-700">메모</p>
              {canEdit ? (
                isEditingMemo ? (
                  <textarea
                    value={memoDraft}
                    onChange={(event) => setMemoDraft(event.target.value)}
                    onBlur={() => void saveMemo(memoDraft)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setMemoDraft(memo);
                        setIsEditingMemo(false);
                      }
                    }}
                    disabled={isSavingMemo}
                    autoFocus
                    className="mt-3 min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400"
                    placeholder="메모 추가..."
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMemoDraft(memo);
                      setIsEditingMemo(true);
                    }}
                    className="mt-3 block w-full rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-3 text-left text-sm leading-6 text-slate-700 transition hover:border-slate-400"
                  >
                    {memo || "메모 추가..."}
                  </button>
                )
              ) : (
                <div className="mt-3 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                  {memo || "등록된 메모가 없습니다."}
                </div>
              )}
              {isSavingMemo ? (
                <p className="mt-2 text-xs text-slate-500">저장 중...</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  클릭 후 수정하고 포커스를 벗어나면 자동 저장됩니다.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">누적 벌점</p>
              <p className="mt-3 text-3xl font-extrabold text-slate-950">{initialStudent.netPoints}점</p>
            </article>
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">등록 플랜</p>
              <p className="mt-3 text-xl font-bold text-slate-950">
                {initialStudent.tuitionPlanName || "직접 입력"}
              </p>
            </article>
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">연락처</p>
              <p className="mt-3 text-xl font-bold text-slate-950">
                {initialStudent.phone || "미등록"}
              </p>
            </article>
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">퇴실일</p>
              <p className="mt-3 text-xl font-bold text-slate-950">
                {formatDate(initialStudent.withdrawnAt)}
              </p>
            </article>
          </div>
        </div>
      </section>

      {initialStudent.status === "WITHDRAWN" ? (
        <section className="rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-4 text-sm leading-6 text-rose-800">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">퇴실 처리된 학생입니다.</p>
              <p className="mt-1">
                {initialStudent.withdrawnNote || "퇴실 사유가 아직 기록되지 않았습니다."}
              </p>
              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReactivate()}
                    disabled={isReactivating}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isReactivating ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    재입실 처리
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeleteOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    학생 삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                기본 정보
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">기본 정보 편집</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {canEdit && initialStudent.status !== "WITHDRAWN" ? (
                <button
                  type="button"
                  onClick={() => setIsWithdrawOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                >
                  <Ban className="h-4 w-4" />
                  퇴실 처리
                </button>
              ) : null}
              {canEdit && initialStudent.status !== "WITHDRAWN" ? (
                <button
                  type="button"
                  onClick={() => setIsDeleteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                  삭제
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <StudentForm
              divisionSlug={divisionSlug}
              mode="edit"
              initialStudent={initialStudent}
              canEdit={canEdit && initialStudent.status !== "WITHDRAWN"}
              showAdvancedFields
              studyTrackOptions={studyTrackOptions}
              seatOptions={seatOptions}
              tuitionPlans={tuitionPlans}
            />
          </div>
        </section>

        <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap gap-2">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-[var(--division-color)] text-white"
                    : "border border-slate-200-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <StudentDetailTabs
              divisionSlug={divisionSlug}
              studentId={initialStudent.id}
              studentName={initialStudent.name}
              studentNumber={initialStudent.studentNumber}
              canManageScoreTargets={canEdit}
              canEdit={canEdit}
              attendanceManagementEnabled={attendanceManagementEnabled}
              leaveManagementEnabled={leaveManagementEnabled}
              interviewManagementEnabled={interviewManagementEnabled}
              pointManagementEnabled={pointManagementEnabled}
              examManagementEnabled={examManagementEnabled}
              paymentManagementEnabled={paymentManagementEnabled}
              activeTab={activeTab}
              attendanceSummary={attendanceSummary}
              weeklyAttendance={weeklyAttendance}
              leavePermissions={leavePermissions}
              pointRecords={pointRecords}
              examResults={examResults}
              scoreTargets={scoreTargets}
              availableScoreTargetExamTypes={availableScoreTargetExamTypes}
              paymentRecords={paymentRecords}
              paymentCategories={paymentCategories}
              tuitionPlans={tuitionPlans}
              defaultPaymentAmount={initialStudent.tuitionAmount}
              defaultPaymentNotes={initialStudent.tuitionPlanName ?? null}
              pointRules={pointRules}
              interviews={interviews}
            />
          </div>
        </section>
      </div>

      <Modal
        open={isWithdrawOpen}
        onClose={closeWithdrawPanel}
        badge="퇴실 처리"
        title="학생 퇴실 처리"
        description="퇴실 사유를 남기면 학생 상태가 퇴실로 전환되고, 학생 관리 화면에도 바로 반영됩니다."
      >
        <form onSubmit={handleWithdraw} className="space-y-6">
            {paymentManagementEnabled ? (
              <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-rose-600 text-white">
                <Ban className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">퇴실 대상 확인</p>
                <p className="text-sm text-slate-500">
                  학생 정보와 현재 상태를 확인한 뒤 퇴실 사유를 기록합니다.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">
                {initialStudent.name}
                <span className="ml-2 text-xs font-medium text-slate-500">
                  {initialStudent.studentNumber}
                </span>
              </p>
              <p className="mt-2">
                직렬 {initialStudent.studyTrack || "미지정"} · 좌석{" "}
                {initialStudent.seatDisplay || "미배정"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StudentStatusBadge status={initialStudent.status} />
                <WarningStageBadge stage={initialStudent.warningStage} />
              </div>
            </div>

            <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm leading-6 text-rose-800">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    퇴실 처리 후에는 학생 수정 화면이 잠기고 퇴실일이 기록됩니다.
                  </p>
                  <p className="mt-1">
                    추후 확인을 위해 퇴실 사유를 최대한 구체적으로 남겨두는 편이 좋습니다.
                  </p>
                </div>
              </div>
            </div>
              </section>
            ) : null}

          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">퇴실 사유</span>
              <textarea
                value={withdrawnNote}
                onChange={(event) => setWithdrawnNote(event.target.value)}
                className="min-h-[160px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 개인 사정으로 자진 퇴실"
                disabled={isWithdrawing}
                required
              />
            </label>
          </section>

          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={isRefundEnabled}
                onChange={(event) => setIsRefundEnabled(event.target.checked)}
                disabled={isWithdrawing}
                className="h-4 w-4 rounded border-slate-300 accent-rose-600"
              />
              <span className="text-sm font-medium text-slate-700">환불 처리 함께 진행</span>
            </label>

            {isRefundEnabled && (
              <div className="mt-4 space-y-4">
                {paymentRecords.length > 0 && (
                  <div className="rounded-[10px] border border-slate-200-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">기존 수납 이력 참고</p>
                    <div className="mt-2 space-y-1">
                      <p>
                        총 납부:{" "}
                        {formatCurrency(
                          paymentRecords
                            .filter((p) => p.amount > 0)
                            .reduce((s, p) => s + p.amount, 0),
                        )}
                        원
                      </p>
                      <p>
                        기존 환불:{" "}
                        {formatCurrency(
                          Math.abs(
                            paymentRecords
                              .filter((p) => p.amount < 0)
                              .reduce((s, p) => s + p.amount, 0),
                          ),
                        )}
                        원
                      </p>
                      <p className="font-semibold text-slate-900">
                        순 잔액:{" "}
                        {formatCurrency(
                          paymentRecords.reduce((s, p) => s + p.amount, 0),
                        )}
                        원
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">환불 금액</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                      placeholder="예: 100000"
                      disabled={isWithdrawing}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">환불 방법</span>
                    <PaymentMethodSelect
                      value={refundMethod}
                      onChange={setRefundMethod}
                      required
                      disabled={isWithdrawing}
                      selectClassName="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                      inputClassName="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">환불 메모</span>
                  <input
                    type="text"
                    value={refundNotes}
                    onChange={(event) => setRefundNotes(event.target.value)}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    placeholder="예: 이용 기간 미사용분 환불"
                    disabled={isWithdrawing}
                  />
                </label>
              </div>
            )}
          </section>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                퇴실 처리 내용은 학생 목록과 상세 화면에 즉시 반영됩니다.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                사유는 추후 학생 이력과 운영 기록을 확인할 때 함께 참고됩니다.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={closeWithdrawPanel}
                disabled={isWithdrawing}
                className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isWithdrawing}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-white0 disabled:opacity-60"
              >
                {isWithdrawing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                퇴실 확정
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 경고 단계 조정 Modal */}
      <Modal
        open={isWarnAdjustOpen}
        title="경고 단계 조정"
        badge="포인트 자동 계산"
        description={`현재 누적 벌점 ${initialStudent.netPoints}점 · 현재 단계: ${initialStudent.warningStage}`}
        widthClassName="max-w-sm"
        onClose={() => setIsWarnAdjustOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            목표 경고 단계를 선택하면 필요한 상벌점이 자동 계산되어 기록됩니다.
          </p>

          <div className="space-y-2">
            {warnTargets.map((target) => {
              const delta = target.threshold - initialStudent.netPoints;
              const isSelected = selectedWarnTarget === target.stage;
              const isCurrent = target.stage === initialStudent.warningStage;
              return (
                <button
                  key={target.stage}
                  type="button"
                  onClick={() => setSelectedWarnTarget(target.stage)}
                  className={`w-full rounded-[10px] border px-4 py-3 text-left text-sm transition ${
                    isSelected
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {target.label}
                      {isCurrent && (
                        <span className="ml-2 text-xs font-normal opacity-60">현재</span>
                      )}
                    </span>
                    <span className="text-xs opacity-75">
                      기준 {target.threshold}점
                      {delta !== 0 && (
                        <span className="ml-1">
                          ({delta > 0 ? `벌점 +${delta}` : `상점 +${Math.abs(delta)}`})
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedWarnTarget && (
            <div className="rounded-[10px] border border-slate-200-slate-100 bg-white px-4 py-3 text-sm text-slate-600">
              {(() => {
                const t = warnTargets.find((x) => x.stage === selectedWarnTarget);
                if (!t) return null;
                const delta = t.threshold - initialStudent.netPoints;
                if (delta === 0) return "이미 해당 단계입니다. 변경이 필요 없습니다.";
                if (delta > 0)
                  return `벌점 ${delta}점을 추가해 누적 벌점을 ${t.threshold}점으로 올립니다.`;
                return `상점 ${Math.abs(delta)}점을 추가해 누적 벌점을 ${t.threshold}점으로 낮춥니다.`;
              })()}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsWarnAdjustOpen(false)}
              className="flex-1 rounded-[10px] border border-slate-200-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={
                !selectedWarnTarget ||
                isAdjusting ||
                warnTargets.find((t) => t.stage === selectedWarnTarget)?.threshold ===
                  initialStudent.netPoints
              }
              onClick={() => void handleWarnAdjust()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isAdjusting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              조정 적용
            </button>
          </div>
        </div>
      </Modal>

      {/* 학생 삭제 확인 모달 */}
      <Modal
        open={isDeleteOpen}
        onClose={() => !isDeleteConfirming && setIsDeleteOpen(false)}
        badge="학생 삭제"
        title="학생을 삭제하시겠습니까?"
        description="삭제된 학생 데이터는 복구할 수 없습니다."
      >
        <form onSubmit={handleDelete} className="space-y-5">
          <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-800">
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

          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">
              {initialStudent.name}
              <span className="ml-2 text-xs font-medium text-slate-500">
                {initialStudent.studentNumber}
              </span>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsDeleteOpen(false)}
              disabled={isDeleteConfirming}
              className="flex-1 rounded-full border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isDeleteConfirming}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {isDeleteConfirming ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              삭제 확정
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
