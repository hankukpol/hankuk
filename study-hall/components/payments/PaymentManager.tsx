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

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentMonth() {
  return getKstToday().slice(0, 7);
}

function getSuggestedPaymentDate(targetMonth: string) {
  return targetMonth === getCurrentMonth() ? getKstToday() : `${targetMonth}-01`;
}

function toFormState(paymentCategories: PaymentCategoryItem[], payment?: PaymentItem | null): FormState {
  return {
    studentId: payment?.studentId ?? "",
    paymentTypeId: payment?.paymentTypeId ?? paymentCategories[0]?.id ?? "",
    amount: payment ? String(payment.amount) : "",
    paymentDate: payment?.paymentDate ?? getKstToday(),
    method: payment?.method ?? "",
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
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const [payments, setPayments] = useState(initialPayments);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(toFormState(paymentCategories));
  const [summaryMonth, setSummaryMonth] = useState(getCurrentMonth());
  const [summaryPaymentTypeId, setSummaryPaymentTypeId] = useState(paymentCategories[0]?.id ?? "");
  const [summaryStatusFilter, setSummaryStatusFilter] = useState<StatusFilter>("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStudentId, setHistoryStudentId] = useState("");
  const [historyPaymentTypeId, setHistoryPaymentTypeId] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

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

      const current = summary.get(payment.studentId);

      if (current) {
        current.count += 1;
        current.totalAmount += payment.amount;
        current.lastPaymentDate =
          !current.lastPaymentDate || payment.paymentDate > current.lastPaymentDate
            ? payment.paymentDate
            : current.lastPaymentDate;
        return;
      }

      summary.set(payment.studentId, {
        count: 1,
        totalAmount: payment.amount,
        lastPaymentDate: payment.paymentDate,
      });
    });

    return summary;
  }, [payments, summaryMonth, summaryPaymentTypeId]);

  const summaryRows = useMemo(() => {
    return activeStudents
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
  }, [activeStudents, paymentSummaryByStudent, summaryStatusFilter]);

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
  const monthlyCollectedAmount = summaryRows.reduce((sum, row) => sum + row.totalAmount, 0);
  const selectedCategoryName =
    paymentCategories.find((category) => category.id === summaryPaymentTypeId)?.name ?? "수납 유형";
  const selectedStudent = activeStudents.find((student) => student.id === form.studentId) ?? null;

  async function refreshPayments(showToast = false) {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/payments`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "수납 내역을 불러오지 못했습니다.");
      }
      setPayments(data.payments);
      if (showToast) {
        toast.success("수납 내역을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 내역을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function resetForm() {
    setEditingPaymentId(null);
    setForm(toFormState(paymentCategories));
    setSelectedPlanId("");
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
      paymentTypeId: summaryPaymentTypeId || (paymentCategories[0]?.id ?? ""),
      paymentDate: getSuggestedPaymentDate(summaryMonth),
    });
    setIsEditorOpen(true);
  }

  function startEdit(payment: PaymentItem) {
    setEditingPaymentId(payment.id);
    setForm(toFormState(paymentCategories, payment));
    setIsEditorOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    const amount = Number(form.amount.replaceAll(",", ""));

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
            amount,
            paymentDate: form.paymentDate,
            method: form.method || null,
            notes: form.notes || null,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "수납 저장에 실패했습니다.");
      }

      toast.success(editingPaymentId ? "수납 내역을 수정했습니다." : "수납 내역을 등록했습니다.");
      await refreshPayments();
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 저장에 실패했습니다.");
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
      await refreshPayments();

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
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(16,185,129,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-emerald-700">완납</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-950">{paidCount}</p>
                <p className="mt-2 text-xs text-emerald-700/80">{formatPaymentMonth(summaryMonth)} 기준 납부 완료 학생</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-emerald-700">
                <WalletCards className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(245,158,11,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-amber-700">미납</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-amber-950">{unpaidCount}</p>
                <p className="mt-2 text-xs text-amber-700/80">아직 납부 이력이 없는 학생</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-amber-700">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">월 수납액</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{formatCurrency(monthlyCollectedAmount)}</p>
                <p className="mt-2 text-xs text-slate-500">{selectedCategoryName} 기준 누적 금액</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <CircleDollarSign className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">이력 건수</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{historyRows.length}</p>
                <p className="mt-2 text-xs text-slate-500">현재 필터 기준 조회 결과</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <Search className="h-5 w-5" />
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                수납 데스크
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">수납 관리</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                월별 완납 현황과 수납 이력을 한 화면에서 보고, 입력과 수정은 우측 패널에서 바로 처리합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshPayments(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                새로고침
              </button>

              <button
                type="button"
                onClick={() => openCreatePanel()}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                수납 등록
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-slate-950">월별 완납 / 미납 현황</p>
                  <p className="mt-1 text-sm text-slate-500">학생별 납부 여부와 마지막 납부일을 빠르게 확인합니다.</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-white border border-slate-200-slate-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                    완납 {paidCount}명
                  </span>
                  <span className="rounded-full bg-white border border-slate-200-slate-200 px-3 py-1 text-xs font-semibold text-amber-700">
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
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
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
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">상태 필터</span>
                  <select
                    value={summaryStatusFilter}
                    onChange={(event) => setSummaryStatusFilter(event.target.value as StatusFilter)}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
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
                    <article key={`${row.studentId}-${summaryMonth}-${summaryPaymentTypeId}`} className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-bold text-slate-950">
                            {row.studentName}
                            <span className="ml-2 text-xs font-medium text-slate-500">{row.studentNumber}</span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500">좌석 {row.seatLabel || "미배정"}</p>
                        </div>

                        <div className="text-right">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.status === "PAID" ? "bg-white border border-slate-200-slate-200 text-emerald-700" : "bg-white border border-slate-200-slate-200 text-amber-700"}`}>
                            {row.status === "PAID" ? "완납" : "미납"}
                          </span>
                          <p className="mt-2 text-xl font-bold text-slate-950">
                            {row.totalAmount > 0 ? `${formatCurrency(row.totalAmount)}원` : "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : "납부 기록 없음"}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => openCreatePanel(row.studentId)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                            row.status === "UNPAID"
                              ? "bg-[var(--division-color)] text-white hover:opacity-90"
                              : "border border-slate-200-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {row.status === "UNPAID" ? "바로 등록" : "추가 등록"}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                    조건에 맞는 학생이 없습니다.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div>
                <p className="text-xl font-bold text-slate-950">수납 이력</p>
                <p className="mt-1 text-sm text-slate-500">검색과 날짜 조건으로 과거 내역을 빠르게 찾을 수 있습니다.</p>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="relative block lg:col-span-2">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                    placeholder="학생명, 수험번호, 수납 유형 검색"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">학생</span>
                  <StudentSearchCombobox
                    students={students}
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
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
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
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">종료일</span>
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(event) => setHistoryDateTo(event.target.value)}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>
              </div>

              {historyRows.length > 0 && (() => {
                const refundTotal = historyRows.filter(p => p.paymentTypeName === "환불").reduce((s, p) => s + p.amount, 0);
                const incomeTotal = historyRows.filter(p => p.paymentTypeName !== "환불").reduce((s, p) => s + p.amount, 0);
                if (refundTotal === 0) return null;
                return (
                  <div className="mb-3 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-4 text-slate-700">
                      <span>수납 합계 <strong>{formatCurrency(incomeTotal)}원</strong></span>
                      <span className="text-rose-600">환불 합계 <strong>-{formatCurrency(refundTotal)}원</strong></span>
                      <span className="font-semibold">순 수납액 <strong>{formatCurrency(incomeTotal - refundTotal)}원</strong></span>
                    </div>
                  </div>
                );
              })()}
              <div className="mt-4 space-y-3">
                {historyRows.length > 0 ? (
                  historyRows.map((payment) => {
                    const isRefund = payment.paymentTypeName === "환불";
                    return (
                    <article key={payment.id} className={`rounded-[10px] border px-4 py-4 ${isRefund ? "border-rose-200 bg-rose-50" : "border-slate-200-slate-200 bg-white"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xl font-bold text-slate-950">
                              {payment.studentName}
                              <span className="ml-2 text-xs font-medium text-slate-500">{payment.studentNumber}</span>
                            </p>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isRefund ? "bg-rose-100 text-rose-700" : "bg-slate-950 text-white"}`}>{payment.paymentTypeName}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                            <span>{formatDate(payment.paymentDate)}</span>
                            <span className={isRefund ? "font-semibold text-rose-600" : ""}>{isRefund ? `-${formatCurrency(payment.amount)}원` : `${formatCurrency(payment.amount)}원`}</span>
                            <span>{formatPaymentMethod(payment.method)}</span>
                            <span>기록자 {payment.recordedByName}</span>
                          </div>

                          <p className="mt-3 text-sm leading-6 text-slate-600">{payment.notes || "메모 없음"}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(payment)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-slate-200 text-slate-600 transition hover:bg-white"
                            aria-label="수납 수정"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(payment.id)}
                            disabled={deletingId === payment.id}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-slate-200 text-rose-600 transition hover:bg-white disabled:opacity-60"
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
                  <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                    조건에 맞는 수납 이력이 없습니다.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      <Modal
        open={isEditorOpen}
        onClose={closeEditor}
        badge={editingPaymentId ? "빠른 수정" : "빠른 등록"}
        title={editingPaymentId ? "수납 내역 수정" : "수납 등록"}
        description="학생 선택, 수납 유형, 금액과 메모를 입력하면 목록과 월별 현황이 즉시 갱신됩니다."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">수납 기본 정보</p>
                <p className="text-sm text-slate-500">학생과 수납 항목을 먼저 지정합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
                <StudentSearchCombobox
                  students={activeStudents}
                  value={form.studentId}
                  onChange={(id) => setForm((current) => ({ ...current, studentId: id }))}
                  placeholder="학생을 선택해 주세요."
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">수납 유형</span>
                  <select
                    value={form.paymentTypeId}
                    onChange={(event) => setForm((current) => ({ ...current, paymentTypeId: event.target.value }))}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
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
                  <span className="mb-2 block text-sm font-medium text-slate-700">납부일</span>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                    required
                  />
                </label>
              </div>
            </div>

            {selectedStudent ? (
              <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
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

          {tuitionPlans.length > 0 && (
            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-amber-50 text-amber-700">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-950">등록 기간 및 금액</p>
                  <p className="text-sm text-slate-500">등록 플랜을 선택하면 금액을 빠르게 맞출 수 있습니다.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
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
                      <p className="shrink-0 text-sm font-bold">
                        {new Intl.NumberFormat("ko-KR").format(plan.amount)}원
                      </p>
                    </div>
                    <p className={`mt-1 text-xs ${selectedPlanId === plan.id ? "text-slate-300" : "text-slate-400"}`}>
                      {plan.durationDays}일
                    </p>
                    {plan.description && (
                      <p className={`mt-0.5 text-xs ${selectedPlanId === plan.id ? "text-slate-300" : "text-slate-400"}`}>
                        {plan.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-emerald-700">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">금액 및 메모</p>
                <p className="text-sm text-slate-500">실제 수납 금액과 처리 메모를 기록합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">금액</span>
                <input
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  inputMode="numeric"
                  placeholder="예: 250000"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">수납 방법</span>
                <input
                  value={form.method}
                  onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="예: 현금, 카드, 계좌이체"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="min-h-[140px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="수납 관련 메모를 기록합니다."
              />
            </label>
          </section>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">저장 후 월별 현황과 수납 이력이 바로 갱신됩니다.</p>
              <p className="mt-1 text-sm text-slate-500">수납 오류를 줄이려면 학생과 수납 유형을 먼저 확인한 뒤 금액을 입력하세요.</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingPaymentId ? "수납 수정" : "수납 등록"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
