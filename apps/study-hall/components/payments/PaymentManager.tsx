"use client";

import { useId } from "react";
import { DialogActions } from "@/components/ui/DialogActions";

import {
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";
import { EnrollPaymentModal } from "@/components/payments/EnrollPaymentModal";
import {
  createPaymentEntryFormValue,
  PaymentEntriesEditor,
  type PaymentEntryFormValue,
} from "@/components/payments/PaymentEntriesEditor";
import { findDefaultPaymentCategoryId, getKstToday } from "@/components/payments/payment-client-helpers";
import { RefundModal } from "@/components/payments/RefundModal";
import { RenewPaymentModal } from "@/components/payments/RenewPaymentModal";
import { SettlementView } from "@/components/payments/SettlementView";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { SlideOver } from "@/components/ui/SlideOver";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { formatCurrency, formatPaymentMethod, formatPaymentMonth } from "@/lib/payment-meta";
import type { PaymentCategoryItem, PaymentItem } from "@/lib/services/payment.service";
import type { StudentListItem } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";

type PaymentManagerProps = {
  divisionSlug: string;
  students: StudentListItem[];
  paymentCategories: PaymentCategoryItem[];
  initialPayments: PaymentItem[];
  tuitionPlans: TuitionPlanItem[];
};

type FormState = {
  studentId: string;
  payments: PaymentEntryFormValue[];
};

type StatusFilter = "ALL" | "PAID" | "UNPAID";
type ViewTab = "status" | "history" | "settlement";

function getCurrentMonth() {
  return getKstToday().slice(0, 7);
}

function getSuggestedPaymentDate(targetMonth: string) {
  return targetMonth === getCurrentMonth() ? getKstToday() : `${targetMonth}-01`;
}

function createDefaultPaymentEntry(
  paymentCategories: PaymentCategoryItem[],
  options?: Partial<Omit<PaymentEntryFormValue, "id">>,
) {
  return createPaymentEntryFormValue({
    paymentTypeId:
      options?.paymentTypeId ?? findDefaultPaymentCategoryId(paymentCategories, ["월납부", "등록비"]),
    amount: options?.amount ?? "",
    paymentDate: options?.paymentDate ?? getKstToday(),
    method: options?.method ?? "card",
    notes: options?.notes ?? "",
  });
}

function toFormState(paymentCategories: PaymentCategoryItem[], payment?: PaymentItem | null): FormState {
  return {
    studentId: payment?.studentId ?? "",
    payments: [
      createDefaultPaymentEntry(paymentCategories, payment
        ? {
            paymentTypeId: payment.paymentTypeId,
            amount: String(payment.amount),
            paymentDate: payment.paymentDate,
            method: payment.method ?? "card",
            notes: payment.notes ?? "",
          }
        : undefined),
    ],
  };
}

function toPaymentRequestEntries(entries: PaymentEntryFormValue[]) {
  return entries.map((entry) => ({
    paymentTypeId: entry.paymentTypeId,
    amount: Number.parseInt(entry.amount.replaceAll(",", ""), 10) || 0,
    paymentDate: entry.paymentDate,
    method: entry.method,
    notes: entry.notes.trim() ? entry.notes : null,
  }));
}

function monthMatches(date: string, targetMonth: string) {
  return date.startsWith(targetMonth);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR");
}

const PAYMENT_VIEW_TABS = [
  { id: "status" as const, label: "월별 수납 현황" },
  { id: "history" as const, label: "수납 내역" },
  { id: "settlement" as const, label: "일일 정산" },
];

export function PaymentManager({
  divisionSlug,
  students,
  paymentCategories,
  initialPayments,
  tuitionPlans,
}: PaymentManagerProps) {
  const dialogFormId = useId();
  const [studentList, setStudentList] = useState(students);
  const [payments, setPayments] = useState(initialPayments);
  const [viewTab, setViewTab] = useState<ViewTab>("status");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [renewStudentId, setRenewStudentId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(toFormState(paymentCategories));
  const [summaryMonth, setSummaryMonth] = useState(getCurrentMonth());
  const [summaryPaymentTypeId, setSummaryPaymentTypeId] = useState(
    findDefaultPaymentCategoryId(paymentCategories, ["월납부", "등록비"]),
  );
  const [summaryStatusFilter, setSummaryStatusFilter] = useState<StatusFilter>("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStudentId, setHistoryStudentId] = useState("");
  const [historyPaymentTypeId, setHistoryPaymentTypeId] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    title: string;
    description: string;
    notice?: string;
  } | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const activeStudents = useMemo(
    () => studentList.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [studentList],
  );
  const billableStudents = useMemo(
    () => activeStudents.filter((student) => !student.tuitionExempt),
    [activeStudents],
  );
  const selectedStudent = activeStudents.find((student) => student.id === form.studentId) ?? null;

  const paymentSummaryByStudent = useMemo(() => {
    const summary = new Map<
      string,
      {
        count: number;
        totalAmount: number;
        lastPaymentDate: string | null;
      }
    >();

    payments.forEach((payment) => {
      if (
        payment.paymentTypeId !== summaryPaymentTypeId ||
        !monthMatches(payment.paymentDate, summaryMonth)
      ) {
        return;
      }

      const amount = payment.amount;
      const current = summary.get(payment.studentId);

      if (current) {
        current.count += 1;
        current.totalAmount += amount;
        current.lastPaymentDate =
          !current.lastPaymentDate || payment.paymentDate > current.lastPaymentDate
            ? payment.paymentDate
            : current.lastPaymentDate;
        return;
      }

      summary.set(payment.studentId, {
        count: 1,
        totalAmount: amount,
        lastPaymentDate: payment.paymentDate,
      });
    });

    return summary;
  }, [payments, summaryMonth, summaryPaymentTypeId]);

  const summaryRows = useMemo(() => {
    return billableStudents
      .map((student) => {
        const matchedPayments = paymentSummaryByStudent.get(student.id);

        return {
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.studentNumber,
          seatLabel: student.seatDisplay,
          status: matchedPayments ? "PAID" : "UNPAID",
          totalAmount: matchedPayments?.totalAmount ?? 0,
          lastPaymentDate: matchedPayments?.lastPaymentDate ?? null,
        };
      })
      .filter((row) => summaryStatusFilter === "ALL" || row.status === summaryStatusFilter)
      .sort((left, right) => left.studentNumber.localeCompare(right.studentNumber, "ko"));
  }, [billableStudents, paymentSummaryByStudent, summaryStatusFilter]);

  const historyRows = useMemo(() => {
    const keyword = historySearch.trim().toLowerCase();

    return payments
      .filter((payment) => {
        if (historyStudentId && payment.studentId !== historyStudentId) {
          return false;
        }
        if (historyPaymentTypeId && payment.paymentTypeId !== historyPaymentTypeId) {
          return false;
        }
        if (historyDateFrom && payment.paymentDate < historyDateFrom) {
          return false;
        }
        if (historyDateTo && payment.paymentDate > historyDateTo) {
          return false;
        }
        if (
          keyword &&
          !payment.studentName.toLowerCase().includes(keyword) &&
          !payment.studentNumber.toLowerCase().includes(keyword) &&
          !payment.paymentTypeName.toLowerCase().includes(keyword)
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          right.paymentDate.localeCompare(left.paymentDate) ||
          right.createdAt.localeCompare(left.createdAt),
      );
  }, [historyDateFrom, historyDateTo, historyPaymentTypeId, historySearch, historyStudentId, payments]);

  const paidCount = summaryRows.filter((row) => row.status === "PAID").length;
  const unpaidCount = summaryRows.filter((row) => row.status === "UNPAID").length;
  const exemptCount = activeStudents.length - billableStudents.length;
  const monthlyCollectedAmount = summaryRows.reduce((sum, row) => sum + row.totalAmount, 0);
  const selectedCategoryName =
    paymentCategories.find((category) => category.id === summaryPaymentTypeId)?.name ?? "수납 유형";

  async function refreshData(showToast = false) {
    setIsRefreshing(true);

    try {
      const [paymentsResponse, studentsResponse] = await Promise.all([
        fetch(`/api/${divisionSlug}/payments`, { cache: "no-store" }),
        fetch(`/api/${divisionSlug}/students`, { cache: "no-store" }),
      ]);
      const [paymentsData, studentsData] = await Promise.all([
        paymentsResponse.json(),
        studentsResponse.json(),
      ]);

      if (!paymentsResponse.ok) {
        throw new Error(paymentsData.error ?? "수납 내역을 불러오지 못했습니다.");
      }

      if (!studentsResponse.ok) {
        throw new Error(studentsData.error ?? "학생 목록을 불러오지 못했습니다.");
      }

      setPayments(paymentsData.payments);
      setStudentList(studentsData.students);

      if (showToast) {
        toast.success("수납 데이터가 새로고침되었습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 데이터를 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function resetForm() {
    setEditingPaymentId(null);
    setSelectedPlanId("");
    setForm(toFormState(paymentCategories));
  }

  function closeEditor() {
    setIsEditorOpen(false);
    resetForm();
  }

  function openCreatePanel(studentId?: string) {
    resetForm();
    setForm({
      studentId: studentId ?? "",
      payments: [
        createDefaultPaymentEntry(paymentCategories, {
          paymentTypeId:
            summaryPaymentTypeId || findDefaultPaymentCategoryId(paymentCategories, ["월납부", "등록비"]),
          paymentDate: getSuggestedPaymentDate(summaryMonth),
        }),
      ],
    });
    setIsEditorOpen(true);
  }

  function startEdit(payment: PaymentItem) {
    setEditingPaymentId(payment.id);
    setSelectedPlanId("");
    setForm(toFormState(paymentCategories, payment));
    setIsEditorOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.studentId) {
      toast.error("학생을 선택해 주세요.");
      return;
    }

    const paymentEntries = toPaymentRequestEntries(form.payments);
    const firstPayment = paymentEntries[0];

    if (!firstPayment) {
      toast.error("결제 정보를 입력해 주세요.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        editingPaymentId
          ? `/api/${divisionSlug}/payments/${editingPaymentId}`
          : paymentEntries.length > 1
            ? `/api/${divisionSlug}/payments/batch`
            : `/api/${divisionSlug}/payments`,
        {
          method: editingPaymentId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingPaymentId
              ? {
                  studentId: form.studentId,
                  ...firstPayment,
                }
              : paymentEntries.length > 1
                ? {
                    studentId: form.studentId,
                    payments: paymentEntries,
                  }
                : {
                    studentId: form.studentId,
                    ...firstPayment,
                  },
          ),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "수납 처리에 실패했습니다.");
      }

      toast.success(
        editingPaymentId
          ? "수납 내역을 수정했습니다."
          : paymentEntries.length > 1
            ? "분할 결제를 등록했습니다."
            : "수납 내역을 등록했습니다.",
      );
      await refreshData();
      closeEditor();
      setSaveSuccessModal({
        title: editingPaymentId
          ? "수납 수정 완료"
          : paymentEntries.length > 1
            ? "분할 결제 등록 완료"
            : "수납 등록 완료",
        description: editingPaymentId
          ? "수납 내역 변경이 저장되어 목록과 미납 현황에 반영되었습니다."
          : paymentEntries.length > 1
            ? "여러 결제 수단이 같은 납부 건으로 저장되었습니다."
            : "수납 내역이 저장되어 목록과 미납 현황에 반영되었습니다.",
        notice: "저장된 수납 내역은 학생별 수납 현황과 수납 이력에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 처리에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(paymentId: string) {
    const confirmed = await confirm({
      title: "수납 내역 삭제",
      description: "이 수납 내역을 삭제하시겠습니까? 삭제 후에는 수납 이력과 미납 현황에서 함께 제거됩니다.",
      confirmLabel: "삭제",
      cancelLabel: "취소",
      variant: "danger",
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(paymentId);

    try {
      const response = await fetch(`/api/${divisionSlug}/payments/${paymentId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "수납 삭제에 실패했습니다.");
      }

      toast.success("수납 내역을 삭제했습니다.");
      await refreshData();

      if (editingPaymentId === paymentId) {
        closeEditor();
      }

      setSaveSuccessModal({
        title: "수납 삭제 완료",
        description: "수납 내역을 삭제했습니다.",
        notice: "삭제된 수납 정보는 목록과 미납 현황에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="admin-flat-page">
        <AdminTabs items={PAYMENT_VIEW_TABS} activeId={viewTab} onChange={setViewTab} label="수납 화면" idPrefix="payment-view" />
        <div className="admin-workspace-toolbar">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData(true)}
                disabled={isRefreshing}
                className="admin-button"
              >
                {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                새로고침
              </button>

              <button
                type="button"
                onClick={() => setIsEnrollOpen(true)}
                className="admin-button"
              >
                <Plus className="h-4 w-4" />
                신규 등록 수납
              </button>

              <button
                type="button"
                onClick={() => {
                  setRenewStudentId(null);
                  setIsRenewOpen(true);
                }}
                className="admin-button"
              >
                <Plus className="h-4 w-4" />
                연장 수납
              </button>

              <button
                type="button"
                onClick={() => setIsRefundOpen(true)}
                className="admin-button admin-button-danger-outline"
              >
                <WalletCards className="h-4 w-4" />
                환불 처리
              </button>

              <button
                type="button"
                onClick={() => openCreatePanel()}
                className="admin-button admin-button-primary"
              >
                <Plus className="h-4 w-4" />
                일반 수납
              </button>
            </div>

        </div>

        <AdminTabPanel id="status" activeId={viewTab} idPrefix="payment-view" className="space-y-4">
                <div className="admin-filter-bar">
                  <label className="block">
                    <span className="admin-label mb-2 block">수납 유형</span>
                    <select
                      value={summaryPaymentTypeId}
                      onChange={(event) => setSummaryPaymentTypeId(event.target.value)}
                      className="w-full"
                    >
                      {paymentCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 block">기준 월</span>
                    <input
                      type="month"
                      value={summaryMonth}
                      onChange={(event) => setSummaryMonth(event.target.value)}
                      className="w-full"
                    />
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 block">상태</span>
                    <select
                      value={summaryStatusFilter}
                      onChange={(event) => setSummaryStatusFilter(event.target.value as StatusFilter)}
                      className="w-full"
                    >
                      <option value="ALL">전체</option>
                      <option value="PAID">완납</option>
                      <option value="UNPAID">미납</option>
                    </select>
                  </label>
                </div>


          <div className="admin-metric-strip">
            <article className="admin-metric-box">
              <p className="admin-metric-box-label">완납</p>
              <p className="admin-metric-box-value text-admin-success">{paidCount}명</p>
            </article>
            <article className="admin-metric-box">
              <p className="admin-metric-box-label">미납</p>
              <p className="admin-metric-box-value text-admin-warning">{unpaidCount}명</p>
            </article>
            <article className="admin-metric-box col-span-2 md:col-span-1">
              <p className="admin-metric-box-label">월 합계</p>
              <p className="admin-metric-box-value">{monthlyCollectedAmount < 0 ? "-" : ""}{formatCurrency(Math.abs(monthlyCollectedAmount))}원</p>
            </article>
          </div>
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">월별 수납 현황 <span className="text-admin-accent">{summaryRows.length}명</span></h2>
            <p className="admin-help">{formatPaymentMonth(summaryMonth)} · {selectedCategoryName}</p>
          </div>
          {exemptCount > 0 ? <p className="admin-notice">수납 면제 {exemptCount}명은 미납 집계에서 제외됩니다.</p> : null}
          <div className="space-y-4 md:hidden">
            {summaryRows.map((row) => (
              <article key={row.studentId} className="admin-record-card">
                <div className="admin-workspace-toolbar">
                  <div><h3 className="admin-section-title">{row.studentName}</h3><p className="admin-help mt-1">{row.studentNumber}</p></div>
                  <span className={row.status === "PAID" ? "admin-badge text-admin-success" : "admin-badge text-admin-warning"}>{row.status === "PAID" ? "완납" : "미납"}</span>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-admin-text-secondary">좌석</dt><dd>{row.seatLabel || "미배정"}</dd></div>
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-admin-text-secondary">마지막 납부일</dt><dd>{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : "납부 이력 없음"}</dd></div>
                </dl>
                <div className="admin-workspace-toolbar mt-4 border-t border-admin-line-soft pt-4">
                  <p className="text-2xl font-bold tabular-nums">{row.totalAmount < 0 ? "-" : ""}{formatCurrency(Math.abs(row.totalAmount))}<span className="ml-1 text-xs font-normal">원</span></p>
                  <button type="button" onClick={() => openCreatePanel(row.studentId)} className="admin-button">{row.status === "UNPAID" ? "바로 수납" : "추가 수납"}</button>
                </div>
              </article>
            ))}
            {!summaryRows.length ? <div className="admin-empty-state">조건에 맞는 학생이 없습니다.</div> : null}
          </div>
          <div className="admin-table-frame hidden md:block">
            <table>
              <thead><tr><th>학생</th><th>좌석</th><th>납부 상태</th><th>마지막 납부일</th><th>수납 금액</th><th>관리</th></tr></thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr key={row.studentId}>
                    <td className="admin-table-name"><p className="font-semibold">{row.studentName}</p><p className="admin-help mt-1">{row.studentNumber}</p></td>
                    <td>{row.seatLabel || "미배정"}</td>
                    <td><span className={row.status === "PAID" ? "admin-badge text-admin-success" : "admin-badge text-admin-warning"}>{row.status === "PAID" ? "완납" : "미납"}</span></td>
                    <td>{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : "-"}</td>
                    <td className="admin-table-amount font-semibold">{row.totalAmount < 0 ? "-" : ""}{formatCurrency(Math.abs(row.totalAmount))}원</td>
                    <td><button type="button" onClick={() => openCreatePanel(row.studentId)} className="admin-button admin-button-compact">{row.status === "UNPAID" ? "바로 수납" : "추가 수납"}</button></td>
                  </tr>
                ))}
                {!summaryRows.length ? <tr><td colSpan={6}>조건에 맞는 학생이 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </AdminTabPanel>

        <AdminTabPanel id="history" activeId={viewTab} idPrefix="payment-view" className="space-y-4">
                <div className="admin-filter-bar">
                  <label className="block">
                    <span className="admin-label mb-2 block">검색</span>
                    <input
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                      className="w-full"
                      placeholder="학생명, 수험번호, 수납 유형 검색"
                    />
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 block">학생</span>
                    <StudentSearchCombobox
                      students={studentList}
                      value={historyStudentId}
                      onChange={setHistoryStudentId}
                      allStudentsLabel="전체 학생"
                    />
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 block">수납 유형</span>
                    <select
                      value={historyPaymentTypeId}
                      onChange={(event) => setHistoryPaymentTypeId(event.target.value)}
                      className="w-full"
                    >
                      <option value="">전체 유형</option>
                      {paymentCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 block">시작일</span>
                    <input
                      type="date"
                      value={historyDateFrom}
                      onChange={(event) => setHistoryDateFrom(event.target.value)}
                      className="w-full"
                    />
                  </label>

                  <label className="block">
                    <span className="admin-label mb-2 block">종료일</span>
                    <input
                      type="date"
                      value={historyDateTo}
                      onChange={(event) => setHistoryDateTo(event.target.value)}
                      className="w-full"
                    />
                  </label>
                </div>


          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">수납 내역 <span className="text-admin-accent">{historyRows.length}건</span></h2>
            <p className="admin-help">{historyDateFrom || "전체 기간"}{historyDateTo ? ` ~ ${historyDateTo}` : ""}</p>
          </div>
          <div className="space-y-4 md:hidden">
            {historyRows.map((payment) => (
              <article key={payment.id} className="admin-record-card">
                <div className="admin-workspace-toolbar">
                  <div><h3 className="admin-section-title">{payment.studentName}</h3><p className="admin-help mt-1">{payment.studentNumber}</p></div>
                  <span className="admin-badge">{payment.paymentTypeName}</span>
                </div>
                <div className="admin-workspace-toolbar mt-4">
                  <p className="admin-help">{formatDate(payment.paymentDate)}<br />{formatPaymentMethod(payment.method)}</p>
                  <p className={`text-2xl font-bold tabular-nums ${payment.amount < 0 ? "text-admin-danger" : ""}`}>{payment.amount < 0 ? "-" : ""}{formatCurrency(Math.abs(payment.amount))}<span className="ml-1 text-xs font-normal">원</span></p>
                </div>
                {payment.notes ? <p className="mt-4 whitespace-pre-wrap break-words text-sm">{payment.notes}</p> : null}
                <div className="admin-workspace-toolbar mt-4 border-t border-admin-line-soft pt-4">
                  <p className="admin-help">기록자 {payment.recordedByName}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(payment)} className="admin-button w-11 px-0" aria-label={`${payment.studentName} 수납 수정`} title="수납 수정"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void handleDelete(payment.id)} disabled={deletingId === payment.id} className="admin-button admin-button-danger-outline w-11 px-0" aria-label={`${payment.studentName} 수납 삭제`} title="수납 삭제">{deletingId === payment.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                  </div>
                </div>
              </article>
            ))}
            {!historyRows.length ? <div className="admin-empty-state">조건에 맞는 수납 내역이 없습니다.</div> : null}
          </div>
          <div className="admin-table-frame hidden md:block">
            <table>
              <thead><tr><th>수납일</th><th>학생</th><th>유형</th><th>금액</th><th>결제수단</th><th>메모</th><th>기록자</th><th>관리</th></tr></thead>
              <tbody>
                {historyRows.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.paymentDate)}</td>
                    <td className="admin-table-name"><p className="font-semibold">{payment.studentName}</p><p className="admin-help mt-1">{payment.studentNumber}</p></td>
                    <td>{payment.paymentTypeName}</td>
                    <td className={`admin-table-amount font-semibold ${payment.amount < 0 ? "text-admin-danger" : ""}`}>{payment.amount < 0 ? "-" : ""}{formatCurrency(Math.abs(payment.amount))}원</td>
                    <td>{formatPaymentMethod(payment.method)}</td>
                    <td className="admin-table-name"><p className="max-w-80 whitespace-pre-wrap break-words">{payment.notes || "-"}</p></td>
                    <td>{payment.recordedByName}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startEdit(payment)} className="admin-button admin-button-compact w-11 px-0" aria-label={`${payment.studentName} 수납 수정`} title="수납 수정"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void handleDelete(payment.id)} disabled={deletingId === payment.id} className="admin-button admin-button-compact admin-button-danger-outline w-11 px-0" aria-label={`${payment.studentName} 수납 삭제`} title="수납 삭제">{deletingId === payment.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!historyRows.length ? <tr><td colSpan={8}>조건에 맞는 수납 내역이 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </AdminTabPanel>

        <AdminTabPanel id="settlement" activeId={viewTab} idPrefix="payment-view">
          <SettlementView divisionSlug={divisionSlug} isActive={viewTab === "settlement"} refreshKey={payments} />
        </AdminTabPanel>
      </div>

      <SlideOver
        open={isEditorOpen}
        onClose={closeEditor}
        badge={editingPaymentId ? "일반 수납 수정" : "일반 수납 등록"}
        title={editingPaymentId ? "수납 내역 수정" : "일반 수납 등록"}
        description="학생별 일반 수납 내역을 추가하거나 수정합니다."
      >
        <form id={`${dialogFormId}-1`} onSubmit={handleSubmit} className="space-y-6">
          <section className="admin-section">
            <div className="grid gap-4">
              <label className="block">
                <span className="admin-label mb-2 block">학생 선택</span>
                <StudentSearchCombobox
                  students={activeStudents}
                  value={form.studentId}
                  onChange={(id) => setForm((current) => ({ ...current, studentId: id }))}
                  placeholder="학생을 선택해 주세요"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 md:col-span-2">
                  <p className="font-medium text-slate-900">
                    {editingPaymentId
                      ? "수정 모드에서는 선택한 수납 1건만 변경합니다."
                      : "여러 결제 수단을 추가하면 같은 납부 건으로 묶어서 저장합니다."}
                  </p>
                  {!editingPaymentId ? (
                    <p className="admin-help mt-1">
                      예: 카드 15만 원 + 포인트 15만 원을 한 번의 납부로 등록
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {selectedStudent ? (
              <div className="admin-notice mt-4">
                <p className="font-semibold text-slate-900">
                  {selectedStudent.name}
                  <span className="admin-help ml-2">{selectedStudent.studentNumber}</span>
                </p>
                <p className="mt-1">
                  직렬 {selectedStudent.studyTrack || "미지정"} · 좌석 {selectedStudent.seatDisplay || "미배정"}
                </p>
              </div>
            ) : null}
          </section>

          {tuitionPlans.length > 0 ? (
            <section className="admin-section">
              <div>
                <h2 className="admin-section-title">빠른 플랜 선택</h2>
                <p className="admin-help mt-1">
                  자주 쓰는 등록 플랜 금액을 일반 수납 폼에 바로 반영할 수 있습니다.
                </p>
                {!editingPaymentId && form.payments.length > 1 ? (
                  <p className="mt-2 text-xs font-medium text-sky-700">
                    분할 결제 중에는 첫 번째 결제 항목에만 플랜 금액이 반영됩니다.
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {tuitionPlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setForm((current) => ({
                        ...current,
                        payments: current.payments.length > 0
                          ? current.payments.map((payment, index) =>
                              index === 0
                                ? {
                                    ...payment,
                                    amount: String(plan.amount),
                                    notes: plan.name,
                                  }
                                : payment,
                            )
                          : [
                              createDefaultPaymentEntry(paymentCategories, {
                                amount: String(plan.amount),
                                notes: plan.name,
                              }),
                            ],
                      }));
                    }}
                    className={`rounded-lg border p-4 text-left transition ${ selectedPlanId === plan.id ? "border-admin-accent bg-admin-accent text-white" : "border-slate-200 bg-white hover:border-slate-400" }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{plan.name}</p>
                      <p className="shrink-0 text-sm font-bold">{formatCurrency(plan.amount)}원</p>
                    </div>
                    <p className={`mt-1 text-xs ${selectedPlanId === plan.id ? "text-slate-300" : "text-slate-500"}`}>
                      {plan.durationDays ? `${plan.durationDays}일` : "기간 자유"}
                    </p>
                    {plan.description ? (
                      <p className={`mt-1 text-xs ${selectedPlanId === plan.id ? "text-slate-300" : "text-slate-500"}`}>
                        {plan.description}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <PaymentEntriesEditor
            entries={form.payments}
            onChange={(payments) => setForm((current) => ({ ...current, payments }))}
            paymentCategories={paymentCategories}
            disabled={isSaving}
            allowMultiple={!editingPaymentId}
            allowNegativeAmounts={Boolean(editingPaymentId && Number(form.payments[0]?.amount ?? 0) < 0)}
            title={editingPaymentId ? "수납 정보" : "결제 정보"}
            description={
              editingPaymentId
                ? "선택한 수납 1건을 수정합니다."
                : "여러 결제 수단을 추가하면 같은 납부 건으로 묶어서 기록합니다."
            }
          />

          <DialogActions>
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="admin-button"
            >
              취소
            </button>
            <button form={`${dialogFormId}-1`}
              type="submit"
              disabled={isSaving}
              className="admin-button admin-button-primary"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingPaymentId ? "수납 수정" : "수납 등록"}
            </button>
          </DialogActions>
        </form>
      </SlideOver>

      <EnrollPaymentModal
        open={isEnrollOpen}
        onClose={() => setIsEnrollOpen(false)}
        divisionSlug={divisionSlug}
        students={studentList}
        paymentCategories={paymentCategories}
        tuitionPlans={tuitionPlans}
        onSuccess={() => refreshData()}
        onRequestRenew={(studentId) => {
          setIsEnrollOpen(false);
          setRenewStudentId(studentId);
          setIsRenewOpen(true);
        }}
      />

      <RenewPaymentModal
        open={isRenewOpen}
        onClose={() => {
          setIsRenewOpen(false);
          setRenewStudentId(null);
        }}
        divisionSlug={divisionSlug}
        students={studentList}
        paymentCategories={paymentCategories}
        tuitionPlans={tuitionPlans}
        onSuccess={() => refreshData()}
        initialStudentId={renewStudentId}
      />

      <RefundModal
        open={isRefundOpen}
        onClose={() => setIsRefundOpen(false)}
        divisionSlug={divisionSlug}
        student={null}
        students={activeStudents}
        paymentCategories={paymentCategories}
        paymentRecords={payments}
        onSuccess={() => refreshData()}
      />

      <ActionCompleteModal
        open={saveSuccessModal !== null}
        onClose={() => setSaveSuccessModal(null)}
        title={saveSuccessModal?.title ?? "저장 완료"}
        description={saveSuccessModal?.description}
        notice={saveSuccessModal?.notice}
      />
      {confirmDialog}
    </>
  );
}
