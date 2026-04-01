"use client";

import {
  CircleDollarSign,
  CreditCard,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EnrollPaymentModal } from "@/components/payments/EnrollPaymentModal";
import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { findDefaultPaymentCategoryId, getKstToday } from "@/components/payments/payment-client-helpers";
import { RefundModal } from "@/components/payments/RefundModal";
import { RenewPaymentModal } from "@/components/payments/RenewPaymentModal";
import { SettlementView } from "@/components/payments/SettlementView";
import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
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
  paymentTypeId: string;
  amount: string;
  paymentDate: string;
  method: string;
  notes: string;
};

type StatusFilter = "ALL" | "PAID" | "UNPAID";
type ViewTab = "status" | "settlement";

function getCurrentMonth() {
  return getKstToday().slice(0, 7);
}

function getSuggestedPaymentDate(targetMonth: string) {
  return targetMonth === getCurrentMonth() ? getKstToday() : `${targetMonth}-01`;
}

function toFormState(paymentCategories: PaymentCategoryItem[], payment?: PaymentItem | null): FormState {
  return {
    studentId: payment?.studentId ?? "",
    paymentTypeId:
      payment?.paymentTypeId ?? findDefaultPaymentCategoryId(paymentCategories, ["월납부", "등록비"]),
    amount: payment ? String(payment.amount) : "",
    paymentDate: payment?.paymentDate ?? getKstToday(),
    method: payment?.method ?? "card",
    notes: payment?.notes ?? "",
  };
}

function monthMatches(date: string, targetMonth: string) {
  return date.startsWith(targetMonth);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR");
}

export function PaymentManager({
  divisionSlug,
  students,
  paymentCategories,
  initialPayments,
  tuitionPlans,
}: PaymentManagerProps) {
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
      ...toFormState(paymentCategories),
      studentId: studentId ?? "",
      paymentTypeId:
        summaryPaymentTypeId || findDefaultPaymentCategoryId(paymentCategories, ["월납부", "등록비"]),
      paymentDate: getSuggestedPaymentDate(summaryMonth),
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
    setIsSaving(true);

    try {
      const response = await fetch(
        editingPaymentId
          ? `/api/${divisionSlug}/payments/${editingPaymentId}`
          : `/api/${divisionSlug}/payments`,
        {
          method: editingPaymentId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: form.studentId,
            paymentTypeId: form.paymentTypeId,
            amount: Number(form.amount),
            paymentDate: form.paymentDate,
            method: form.method,
            notes: form.notes || null,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "수납 처리에 실패했습니다.");
      }

      toast.success(editingPaymentId ? "수납 내역을 수정했습니다." : "수납 내역을 등록했습니다.");
      await refreshData();
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 처리에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(paymentId: string) {
    if (!window.confirm("이 수납 내역을 삭제하시겠습니까?")) {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(16,185,129,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-emerald-700">완납</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-950">{paidCount}</p>
                <p className="mt-2 text-xs text-emerald-700/80">
                  {formatPaymentMonth(summaryMonth)} 기준 납부 완료 학생
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-700">
                <WalletCards className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(245,158,11,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-amber-700">미납</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-amber-950">{unpaidCount}</p>
                <p className="mt-2 text-xs text-amber-700/80">아직 납부 이력이 없는 학생</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-amber-50 text-amber-700">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">월 합계</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
                  {monthlyCollectedAmount < 0 ? "-" : ""}
                  {formatCurrency(Math.abs(monthlyCollectedAmount))}
                </p>
                <p className="mt-2 text-xs text-slate-500">{selectedCategoryName} 기준 합계 금액</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <CircleDollarSign className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">기록 건수</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{historyRows.length}</p>
                <p className="mt-2 text-xs text-slate-500">현재 필터 기준 조회 결과</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <Search className="h-5 w-5" />
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                PAYMENT
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">수납 관리</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                학생 등록 수납, 연장 수납, 일반 수납과 정산 조회를 한 화면에서 처리합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                새로고침
              </button>

              <button
                type="button"
                onClick={() => setIsEnrollOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                연장 수납
              </button>

              <button
                type="button"
                onClick={() => setIsRefundOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
              >
                <WalletCards className="h-4 w-4" />
                환불 처리
              </button>

              <button
                type="button"
                onClick={() => openCreatePanel()}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                일반 수납
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewTab("status")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                viewTab === "status"
                  ? "bg-[var(--division-color)] text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              수납 현황
            </button>
            <button
              type="button"
              onClick={() => setViewTab("settlement")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                viewTab === "settlement"
                  ? "bg-[var(--division-color)] text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              일일 정산
            </button>
          </div>

          {viewTab === "settlement" ? (
            <div className="mt-6">
              <SettlementView divisionSlug={divisionSlug} />
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
              <section className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold text-slate-950">월별 수납 현황</p>
                    <p className="mt-1 text-sm text-slate-500">
                      학생별 납부 여부와 마지막 납부일을 빠르게 확인합니다.
                    </p>
                    {exemptCount > 0 ? (
                      <p className="mt-2 text-xs font-medium text-sky-700">
                        수납 면제 {exemptCount}명은 미납 집계에서 제외됩니다.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-full border border-slate-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      완납 {paidCount}명
                    </span>
                    <span className="rounded-full border border-slate-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      미납 {unpaidCount}명
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">수납 유형</span>
                    <select
                      value={summaryPaymentTypeId}
                      onChange={(event) => setSummaryPaymentTypeId(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    >
                      {paymentCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">기준 월</span>
                    <input
                      type="month"
                      value={summaryMonth}
                      onChange={(event) => setSummaryMonth(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">상태</span>
                    <select
                      value={summaryStatusFilter}
                      onChange={(event) => setSummaryStatusFilter(event.target.value as StatusFilter)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    >
                      <option value="ALL">전체</option>
                      <option value="PAID">완납</option>
                      <option value="UNPAID">미납</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 max-h-[540px] space-y-3 overflow-y-auto pr-1">
                  {summaryRows.length > 0 ? (
                    summaryRows.map((row) => (
                      <article key={`${row.studentId}-${summaryMonth}-${summaryPaymentTypeId}`} className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-bold text-slate-950">
                              {row.studentName}
                              <span className="ml-2 text-xs font-medium text-slate-500">{row.studentNumber}</span>
                            </p>
                            <p className="mt-2 text-sm text-slate-600">
                              좌석 {row.seatLabel || "미배정"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span
                                className={`rounded-full px-2.5 py-1 font-semibold ${
                                  row.status === "PAID"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {row.status === "PAID" ? "완납" : "미납"}
                              </span>
                              {row.lastPaymentDate ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                                  마지막 납부 {formatDate(row.lastPaymentDate)}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-sm text-slate-500">누적 금액</p>
                            <p className="mt-2 text-lg font-bold text-slate-950">
                              {row.totalAmount < 0 ? "-" : ""}
                              {formatCurrency(Math.abs(row.totalAmount))}원
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => openCreatePanel(row.studentId)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              row.status === "UNPAID"
                                ? "bg-[var(--division-color)] text-white hover:opacity-90"
                                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {row.status === "UNPAID" ? "바로 수납" : "추가 수납"}
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                      조건에 맞는 학생이 없습니다.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-xl font-bold text-slate-950">수납 이력</p>
                  <p className="mt-1 text-sm text-slate-500">
                    학생, 수납 유형, 기간 조건으로 과거 내역을 조회합니다.
                  </p>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <label className="relative block lg:col-span-2">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400"
                      placeholder="학생명, 수험번호, 수납 유형 검색"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">학생</span>
                    <StudentSearchCombobox
                      students={studentList}
                      value={historyStudentId}
                      onChange={setHistoryStudentId}
                      allStudentsLabel="전체 학생"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">수납 유형</span>
                    <select
                      value={historyPaymentTypeId}
                      onChange={(event) => setHistoryPaymentTypeId(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
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
                    <span className="mb-2 block text-sm font-medium text-slate-700">시작일</span>
                    <input
                      type="date"
                      value={historyDateFrom}
                      onChange={(event) => setHistoryDateFrom(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">종료일</span>
                    <input
                      type="date"
                      value={historyDateTo}
                      onChange={(event) => setHistoryDateTo(event.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    />
                  </label>
                </div>

                <div className="mt-4 space-y-3">
                  {historyRows.length > 0 ? (
                    historyRows.map((payment) => {
                      const isRefund = payment.amount < 0;

                      return (
                        <article key={payment.id} className={`rounded-[10px] border px-4 py-4 ${isRefund ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-bold text-slate-950">
                                  {payment.studentName}
                                  <span className="ml-2 text-xs font-medium text-slate-500">{payment.studentNumber}</span>
                                </p>
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isRefund ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                                  {payment.paymentTypeName}
                                </span>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                <span>{formatDate(payment.paymentDate)}</span>
                                <span className={isRefund ? "font-semibold text-rose-700" : "font-semibold text-slate-900"}>
                                  {payment.amount < 0 ? "-" : ""}
                                  {formatCurrency(Math.abs(payment.amount))}원
                                </span>
                                <span>{formatPaymentMethod(payment.method)}</span>
                                <span>기록자 {payment.recordedByName}</span>
                              </div>

                              <p className="mt-3 text-sm leading-6 text-slate-600">{payment.notes || "메모 없음"}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(payment)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                                aria-label="수납 수정"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(payment.id)}
                                disabled={deletingId === payment.id}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                aria-label="수납 삭제"
                              >
                                {deletingId === payment.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                      조건에 맞는 수납 내역이 없습니다.
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={isEditorOpen}
        onClose={closeEditor}
        badge={editingPaymentId ? "일반 수납 수정" : "일반 수납 등록"}
        title={editingPaymentId ? "수납 내역 수정" : "일반 수납 등록"}
        description="학생별 일반 수납 내역을 추가하거나 수정합니다."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-[10px] border border-slate-200 bg-white p-5">
            <div className="grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
                <StudentSearchCombobox
                  students={activeStudents}
                  value={form.studentId}
                  onChange={(id) => setForm((current) => ({ ...current, studentId: id }))}
                  placeholder="학생을 선택해 주세요"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">수납 유형</span>
                  <select
                    value={form.paymentTypeId}
                    onChange={(event) => setForm((current) => ({ ...current, paymentTypeId: event.target.value }))}
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    required
                  >
                    {paymentCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">결제일</span>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    required
                  />
                </label>
              </div>
            </div>

            {selectedStudent ? (
              <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">
                  {selectedStudent.name}
                  <span className="ml-2 text-xs font-medium text-slate-500">{selectedStudent.studentNumber}</span>
                </p>
                <p className="mt-1">
                  직렬 {selectedStudent.studyTrack || "미지정"} · 좌석 {selectedStudent.seatDisplay || "미배정"}
                </p>
              </div>
            ) : null}
          </section>

          {tuitionPlans.length > 0 ? (
            <section className="rounded-[10px] border border-slate-200 bg-white p-5">
              <div>
                <p className="text-lg font-bold text-slate-950">빠른 플랜 선택</p>
                <p className="mt-1 text-sm text-slate-500">
                  자주 쓰는 등록 플랜 금액을 일반 수납 폼에 바로 반영할 수 있습니다.
                </p>
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
                        amount: String(plan.amount),
                        notes: plan.name,
                      }));
                    }}
                    className={`rounded-[10px] border p-4 text-left transition ${
                      selectedPlanId === plan.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
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

          <section className="rounded-[10px] border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">금액</span>
                <input
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  inputMode="numeric"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제수단</span>
                <PaymentMethodSelect
                  value={form.method}
                  onChange={(value) => setForm((current) => ({ ...current, method: value }))}
                  required
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  rows={4}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingPaymentId ? "수납 수정" : "수납 등록"}
            </button>
          </div>
        </form>
      </Modal>

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
    </>
  );
}
