"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaymentCategory, PaymentMethod } from "@prisma/client";
import {
  MAX_INSTALLMENT_COUNT,
  toInstallmentDateInputValue,
} from "@/lib/payments/installment-schedule";

type TextbookOption = {
  id: string;
  title: string;
  price: number;
};

type StudentSearchRow = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type EnrollmentSummary = {
  id: string;
  label: string;
  status: string;
  startDate: string;
  endDate: string | null;
};

type StudentSummary = {
  examNumber: string;
  name: string;
  mobile: string | null;
  enrollments: EnrollmentSummary[];
};

type ItemDraft = {
  key: string;
  itemName: string;
  unitPrice: string;
  quantity: string;
  itemId: string | null;
};

type InstallmentDraft = {
  key: string;
  amount: string;
  dueDate: string;
};

type PaymentFormProps = {
  initialTextbooks: TextbookOption[];
  initialExamNumber: string;
  initialEnrollmentId?: string;
  initialCategory?: string;
};

const CATEGORY_OPTIONS: Array<{ value: PaymentCategory; label: string }> = [
  { value: "TUITION", label: "수강료" },
  { value: "TEXTBOOK", label: "교재" },
  { value: "FACILITY", label: "시설비" },
  { value: "MATERIAL", label: "교구 · 모의물" },
  { value: "ETC", label: "기타" },
];

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "현금" },
  { value: "TRANSFER", label: "계좌이체" },
];

const CASH_RECEIPT_OPTIONS = [
  { value: "NONE", label: "발행 안 함" },
  { value: "INCOME_DEDUCTION", label: "소득공제" },
  { value: "EXPENSE_PROOF", label: "지출증빙" },
] as const;

function createEmptyItem(): ItemDraft {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    unitPrice: "",
    quantity: "1",
    itemId: null,
  };
}

function addMonthsDateValue(base: Date, monthOffset: number) {
  const next = new Date(base);
  next.setMonth(next.getMonth() + monthOffset);
  return toInstallmentDateInputValue(next);
}

function buildDefaultInstallments(totalAmount: number): InstallmentDraft[] {
  const safeAmount = Math.max(0, totalAmount);
  const firstAmount = Math.floor(safeAmount / 2);
  const secondAmount = safeAmount - firstAmount;
  const today = new Date();

  return [
    {
      key: crypto.randomUUID(),
      amount: String(firstAmount),
      dueDate: addMonthsDateValue(today, 0),
    },
    {
      key: crypto.randomUUID(),
      amount: String(secondAmount),
      dueDate: addMonthsDateValue(today, 1),
    },
  ];
}

function formatKRW(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function todayDateTimeValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function numeric(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
  }
  return payload as T;
}

function isPaymentCategory(value: string | undefined): value is PaymentCategory {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

function pickEnrollmentId(enrollments: EnrollmentSummary[], preferredId?: string) {
  if (preferredId && enrollments.some((enrollment) => enrollment.id === preferredId)) {
    return preferredId;
  }

  return enrollments[0]?.id ?? "";
}

export function PaymentForm({
  initialTextbooks,
  initialExamNumber,
  initialEnrollmentId,
  initialCategory,
}: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialExamNumber);
  const [searchResults, setSearchResults] = useState<StudentSearchRow[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");
  const [category, setCategory] = useState<PaymentCategory>(
    isPaymentCategory(initialCategory) ? initialCategory : "TUITION",
  );
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [note, setNote] = useState("");
  const [cashReceiptType, setCashReceiptType] = useState<(typeof CASH_RECEIPT_OPTIONS)[number]["value"]>("NONE");
  const [cashReceiptNo, setCashReceiptNo] = useState("");
  const [cashReceiptIssuedAt, setCashReceiptIssuedAt] = useState(todayDateTimeValue());
  const [items, setItems] = useState<ItemDraft[]>([createEmptyItem()]);
  const [useInstallments, setUseInstallments] = useState(false);
  const [installments, setInstallments] = useState<InstallmentDraft[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialExamNumber) return;

    startTransition(async () => {
      try {
        const result = await requestJson<{ data: { student: StudentSummary | null } }>(
          `/api/members/${encodeURIComponent(initialExamNumber)}/profile`,
        );
        if (result.data.student) {
          setSelectedStudent(result.data.student);
          setSelectedEnrollmentId(pickEnrollmentId(result.data.student.enrollments, initialEnrollmentId));
          setSearch(result.data.student.examNumber);
        }
      } catch {
        // keep page usable even when prefill lookup fails
      }
    });
  }, [initialEnrollmentId, initialExamNumber]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchMessage(trimmed.length === 0 ? null : "학생 검색은 2글자 이상 입력하세요.");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await requestJson<{ students: StudentSearchRow[] }>(
          `/api/students/search?q=${encodeURIComponent(trimmed)}&limit=8`,
        );
        if (cancelled) return;
        setSearchResults(result.students);
        setSearchMessage(result.students.length === 0 ? "검색 결과가 없습니다." : null);
      } catch (error) {
        if (cancelled) return;
        setSearchResults([]);
        setSearchMessage(error instanceof Error ? error.message : "학생 검색에 실패했습니다.");
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (category !== "TUITION") {
      setSelectedEnrollmentId("");
      return;
    }

    if (!selectedStudent) return;

    if (selectedStudent.enrollments.length === 0) {
      setSelectedEnrollmentId("");
      return;
    }

    setSelectedEnrollmentId((current) => {
      if (current && selectedStudent.enrollments.some((enrollment) => enrollment.id === current)) {
        return current;
      }
      return selectedStudent.enrollments[0]?.id ?? "";
    });
  }, [category, selectedStudent]);

  useEffect(() => {
    if (category !== "TUITION") return;
    const selectedEnrollment = selectedStudent?.enrollments.find((enrollment) => enrollment.id === selectedEnrollmentId);
    if (!selectedEnrollment) return;

    setItems((current) => {
      const first = current[0] ?? createEmptyItem();
      const nextFirst: ItemDraft = {
        ...first,
        itemId: selectedEnrollment.id,
        itemName: selectedEnrollment.label,
      };
      return [nextFirst, ...current.slice(1)];
    });
  }, [category, selectedEnrollmentId, selectedStudent]);

  useEffect(() => {
    if (category === "TUITION") return;
    setUseInstallments(false);
    setInstallments([]);
  }, [category]);

  const grossAmount = items.reduce((sum, item) => sum + numeric(item.unitPrice) * Math.max(1, numeric(item.quantity)), 0);
  const discount = numeric(discountAmount);
  const netAmount = Math.max(0, grossAmount - discount);
  const installmentTotal = installments.reduce((sum, item) => sum + numeric(item.amount), 0);

  useEffect(() => {
    if (!useInstallments) return;
    if (installments.length > 0) return;
    setInstallments(buildDefaultInstallments(netAmount));
  }, [installments.length, netAmount, useInstallments]);

  async function handleStudentPick(examNumber: string) {
    setErrorMessage(null);
    try {
      const result = await requestJson<{ data: { student: StudentSummary | null } }>(
        `/api/members/${encodeURIComponent(examNumber)}/profile`,
      );
      if (!result.data.student) {
        throw new Error("학생 정보를 불러오지 못했습니다.");
      }
      setSelectedStudent(result.data.student);
      setSelectedEnrollmentId(pickEnrollmentId(result.data.student.enrollments, initialEnrollmentId));
      setSearch(`${result.data.student.name} ${result.data.student.examNumber}`);
      setSearchResults([]);
      setSearchMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "학생 정보를 불러오지 못했습니다.");
    }
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        if (category === "TEXTBOOK" && patch.itemName !== undefined) {
          const itemName = patch.itemName.trim();
          const matched = initialTextbooks.find((textbook) => textbook.title === itemName);
          if (matched) {
            next.unitPrice = String(matched.price);
            next.itemId = matched.id;
          } else if (itemName.length === 0) {
            next.itemId = null;
          }
        }
        return next;
      }),
    );
  }

  function addItem() {
    setItems((current) => [...current, createEmptyItem()]);
  }

  function removeItem(key: string) {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)));
  }

  function toggleInstallments(nextChecked: boolean) {
    setUseInstallments(nextChecked);
    if (!nextChecked) {
      setInstallments([]);
      return;
    }

    setInstallments((current) => (current.length > 0 ? current : buildDefaultInstallments(netAmount)));
  }

  function updateInstallment(key: string, patch: Partial<InstallmentDraft>) {
    setInstallments((current) =>
      current.map((installment) =>
        installment.key === key ? { ...installment, ...patch } : installment,
      ),
    );
  }

  function addInstallment() {
    setInstallments((current) => {
      if (current.length >= MAX_INSTALLMENT_COUNT) return current;

      const baseDate =
        current.length > 0
          ? new Date(`${current[current.length - 1].dueDate}T00:00:00+09:00`)
          : new Date();

      return [
        ...current,
        {
          key: crypto.randomUUID(),
          amount: "",
          dueDate: addMonthsDateValue(baseDate, 1),
        },
      ];
    });
  }

  function removeInstallment(key: string) {
    setInstallments((current) => (current.length <= 1 ? current : current.filter((item) => item.key !== key)));
  }

  function resetInstallments() {
    setInstallments(buildDefaultInstallments(netAmount));
  }

  function resetMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function buildPayload() {
    const normalizedItems = items
      .map((item) => {
        const quantity = Math.max(1, numeric(item.quantity));
        const unitPrice = numeric(item.unitPrice);
        return {
          itemType: category,
          itemId: category === "TUITION" ? item.itemId : item.itemId,
          itemName: item.itemName.trim(),
          unitPrice,
          quantity,
          amount: unitPrice * quantity,
        };
      })
      .filter((item) => item.itemName.length > 0 && item.amount > 0);

    if (normalizedItems.length === 0) {
      throw new Error("수납 항목과 금액을 1건 이상 입력하세요.");
    }

    if (category === "TUITION") {
      if (!selectedStudent) {
        throw new Error("수강료 수납은 학생을 먼저 선택해야 합니다.");
      }
      if (!selectedEnrollmentId) {
        throw new Error("수강료 수납은 연결할 수강 등록을 선택해야 합니다.");
      }
    }

    if (discount > grossAmount) {
      throw new Error("할인 금액은 총 수납 예정 금액보다 클 수 없습니다.");
    }

    if (useInstallments) {
      if (category !== "TUITION") {
        throw new Error("분납 계획은 수강료 수납에서만 사용할 수 있습니다.");
      }
      if (netAmount <= 0) {
        throw new Error("최종 수납 금액이 0원 이하이면 분납 계획을 만들 수 없습니다.");
      }
      if (installments.length < 2) {
        throw new Error("분납 회차는 최소 2건 이상 입력해야 합니다.");
      }
      if (installmentTotal !== netAmount) {
        throw new Error("분납 회차 합계는 최종 수납 금액과 일치해야 합니다.");
      }
    }

    return {
      examNumber: selectedStudent?.examNumber ?? null,
      enrollmentId: category === "TUITION" ? selectedEnrollmentId : null,
      category,
      method,
      grossAmount,
      discountAmount: discount,
      netAmount,
      note: note.trim() || null,
      items: normalizedItems,
      cashReceiptType: method === "CASH" ? cashReceiptType : "NONE",
      cashReceiptNo: method === "CASH" && cashReceiptNo.trim() ? cashReceiptNo.trim() : null,
      cashReceiptIssuedAt:
        method === "CASH" && cashReceiptType !== "NONE" && cashReceiptIssuedAt
          ? new Date(cashReceiptIssuedAt).toISOString()
          : null,
      installments: useInstallments
        ? installments.map((installment) => ({
            amount: numeric(installment.amount),
            dueDate: installment.dueDate,
          }))
        : [],
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();

    startTransition(async () => {
      try {
        const payload = buildPayload();
        const result = await requestJson<{ payment: { id: string } }>("/api/payments", {
          method: "POST",
          headers: {
            "X-Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(payload),
        });
        setSuccessMessage("수납이 등록되었습니다. 상세 화면으로 이동합니다.");
        router.push(`/admin/payments/${result.payment.id}`);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "수납 등록에 실패했습니다.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
      <section className="rounded-[24px] border border-ink/10 bg-mist/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">학생 선택</h2>
            <p className="mt-1 text-sm text-slate">학생명, 학번으로 검색한 뒤 수납 대상 학생을 연결합니다.</p>
          </div>
          {selectedStudent ? (
            <Link
              href={`/admin/students/${selectedStudent.examNumber}`}
              className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              학생 상세로 이동
            </Link>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="학생명 또는 학번 검색"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
            />
            {searchMessage ? <p className="mt-2 text-xs text-slate">{searchMessage}</p> : null}
            {searchResults.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white">
                {searchResults.map((student) => (
                  <button
                    key={student.examNumber}
                    type="button"
                    onClick={() => handleStudentPick(student.examNumber)}
                    className="flex w-full items-center justify-between border-b border-ink/10 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-mist/60"
                  >
                    <div>
                      <div className="font-medium text-ink">{student.name}</div>
                      <div className="text-xs text-slate">{student.examNumber} · {student.phone ?? "연락처 없음"}</div>
                    </div>
                    <span className="text-xs font-medium text-ember">선택</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">학생 4대 데이터</p>
            {selectedStudent ? (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-slate">학번 / 이름</p>
                  <p className="font-medium text-ink">
                    {selectedStudent.examNumber} · {selectedStudent.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate">연락처</p>
                  <p className="text-ink">{selectedStudent.mobile ?? "연락처 없음"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate">수강내역</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedStudent.enrollments.length > 0 ? (
                      selectedStudent.enrollments.map((enrollment) => (
                        <button
                          key={enrollment.id}
                          type="button"
                          onClick={() => {
                            setCategory("TUITION");
                            setSelectedEnrollmentId(enrollment.id);
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            selectedEnrollmentId === enrollment.id
                              ? "border-forest/30 bg-forest/10 text-forest"
                              : "border-ink/10 bg-white text-slate"
                          }`}
                        >
                          {enrollment.label} · {enrollment.status}
                        </button>
                      ))
                    ) : (
                      <span className="text-slate">연결된 수강 등록이 없습니다.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate">학생을 선택하면 학번, 이름, 연락처, 수강내역을 함께 표시합니다.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <div className="space-y-6 rounded-[24px] border border-ink/10 p-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">수납 기본 정보</h2>
            <p className="mt-1 text-sm text-slate">수납 유형, 결제 수단, 현금영수증 발행 여부를 지정합니다.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-slate">수납 유형</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as PaymentCategory)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-slate">결제 수단</span>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
              >
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {category === "TUITION" ? (
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-slate">연결할 수강 등록</span>
              <select
                value={selectedEnrollmentId}
                onChange={(event) => setSelectedEnrollmentId(event.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                disabled={!selectedStudent || selectedStudent.enrollments.length === 0}
              >
                {selectedStudent?.enrollments.length ? (
                  selectedStudent.enrollments.map((enrollment) => (
                    <option key={enrollment.id} value={enrollment.id}>
                      {enrollment.label} · {enrollment.status}
                    </option>
                  ))
                ) : (
                  <option value="">수강 등록을 먼저 선택하세요.</option>
                )}
              </select>
            </label>
          ) : null}

          {method === "CASH" ? (
            <div className="grid gap-4 rounded-2xl border border-ink/10 bg-mist/40 p-4 sm:grid-cols-3">
              <label className="space-y-1 text-sm sm:col-span-1">
                <span className="text-xs font-medium text-slate">현금영수증</span>
                <select
                  value={cashReceiptType}
                  onChange={(event) => setCashReceiptType(event.target.value as (typeof CASH_RECEIPT_OPTIONS)[number]["value"])}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                >
                  {CASH_RECEIPT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-1">
                <span className="text-xs font-medium text-slate">승인번호</span>
                <input
                  type="text"
                  value={cashReceiptNo}
                  onChange={(event) => setCashReceiptNo(event.target.value)}
                  placeholder="선택 입력"
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-1">
                <span className="text-xs font-medium text-slate">발행일시</span>
                <input
                  type="datetime-local"
                  value={cashReceiptIssuedAt}
                  onChange={(event) => setCashReceiptIssuedAt(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                />
              </label>
            </div>
          ) : null}

          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-slate">메모</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
              placeholder="수납 메모나 확인 사항을 남길 수 있습니다."
            />
          </label>
        </div>

        <div className="space-y-6 rounded-[24px] border border-ink/10 p-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">수납 항목</h2>
            <p className="mt-1 text-sm text-slate">항목별 단가와 수량을 입력하면 총 수납 예정 금액이 자동 계산됩니다.</p>
          </div>

          {items.map((item, index) => (
            <div key={item.key} className="rounded-2xl border border-ink/10 bg-mist/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">항목 {index + 1}</p>
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="text-xs font-medium text-red-600"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1.5fr_0.7fr_0.6fr]">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-slate">항목명</span>
                  <input
                    list={category === "TEXTBOOK" ? "payment-textbooks" : undefined}
                    value={item.itemName}
                    onChange={(event) => updateItem(item.key, { itemName: event.target.value })}
                    placeholder={category === "TUITION" ? "수강 등록을 선택하면 자동 입력됩니다." : "항목명을 입력하세요."}
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-slate">단가</span>
                  <input
                    value={item.unitPrice}
                    onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-slate">수량</span>
                  <input
                    value={item.quantity}
                    onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                    inputMode="numeric"
                    placeholder="1"
                    className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                  />
                </label>
              </div>
              <p className="mt-3 text-sm text-slate">항목 금액 {formatKRW(numeric(item.unitPrice) * Math.max(1, numeric(item.quantity)))}</p>
            </div>
          ))}

          <datalist id="payment-textbooks">
            {initialTextbooks.map((textbook) => (
              <option key={textbook.id} value={textbook.title} />
            ))}
          </datalist>

          <button
            type="button"
            onClick={addItem}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            + 항목 추가
          </button>

          <div className="rounded-2xl border border-forest/20 bg-forest/5 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate">총 수납 예정 금액</span>
              <span className="font-semibold text-ink">{formatKRW(grossAmount)}</span>
            </div>
            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium text-slate">할인 금액</span>
              <input
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                inputMode="numeric"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-ember/40"
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-slate">최종 수납 금액</span>
              <span className="text-lg font-semibold text-forest">{formatKRW(netAmount)}</span>
            </div>
          </div>

          {category === "TUITION" ? (
            <div className="rounded-2xl border border-ink/10 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">분납 계획</h3>
                  <p className="mt-1 text-xs text-slate">
                    수강료 수납에만 적용됩니다. 최대 {MAX_INSTALLMENT_COUNT}회차까지 등록할 수 있습니다.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={useInstallments}
                    onChange={(event) => toggleInstallments(event.target.checked)}
                    className="h-4 w-4 rounded border border-ink/20 text-ember focus:ring-ember/30"
                  />
                  분납 사용
                </label>
              </div>

              {useInstallments ? (
                <div className="mt-4 space-y-3">
                  {installments.map((installment, index) => (
                    <div key={installment.key} className="rounded-2xl border border-ink/10 bg-mist/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium text-ink">{index + 1}회차</p>
                        {installments.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeInstallment(installment.key)}
                            className="text-xs font-medium text-red-600"
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate">금액</span>
                          <input
                            value={installment.amount}
                            onChange={(event) =>
                              updateInstallment(installment.key, { amount: event.target.value })
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate">납부 예정일</span>
                          <input
                            type="date"
                            value={installment.dueDate}
                            onChange={(event) =>
                              updateInstallment(installment.key, { dueDate: event.target.value })
                            }
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                          />
                        </label>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-mist/20 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">분납 합계 {formatKRW(installmentTotal)}</p>
                      <p className={`mt-1 text-xs ${installmentTotal === netAmount ? "text-forest" : "text-red-600"}`}>
                        {installmentTotal === netAmount
                          ? "최종 수납 금액과 일치합니다."
                          : "최종 수납 금액과 일치하도록 금액을 조정해 주세요."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={resetInstallments}
                        className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                      >
                        균등 분할 다시 계산
                      </button>
                      <button
                        type="button"
                        onClick={addInstallment}
                        disabled={installments.length >= MAX_INSTALLMENT_COUNT}
                        className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        + 회차 추가
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {errorMessage ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div aria-live="polite" className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60"
        >
          {isPending ? "수납 등록 중..." : "수납 등록"}
        </button>
      </div>
    </form>
  );
}
