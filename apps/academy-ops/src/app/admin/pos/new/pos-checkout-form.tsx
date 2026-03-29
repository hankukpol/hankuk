"use client";

import { useRef, useState } from "react";
import { PaymentMethod } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SpecialLectureOption = {
  id: string;
  name: string;
  price: number;
};

type StudentResult = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type Props = {
  specialLectures: SpecialLectureOption[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function generateIdempotencyKey(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string; icon: string }> = [
  { value: "CASH", label: "현금", icon: "💵" },
  { value: "CARD", label: "카드", icon: "💳" },
  { value: "TRANSFER", label: "계좌이체", icon: "🏦" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PosCheckoutForm({ specialLectures }: Props) {
  const idempotencyKey = useRef(generateIdempotencyKey());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Student state
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [isNonMember, setIsNonMember] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Product / amount state
  const [selectedLectureId, setSelectedLectureId] = useState<string>("");
  const [itemName, setItemName] = useState("");
  const [grossAmount, setGrossAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Method
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  // Note
  const [note, setNote] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPaymentId, setSuccessPaymentId] = useState<string | null>(null);

  const netAmount = Math.max(0, grossAmount - discountAmount);

  // ------ Student search ------
  function handleStudentSearchChange(value: string) {
    setStudentSearch(value);
    if (selectedStudent) setSelectedStudent(null);
    if (!value.trim()) {
      setStudentResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await requestJson<{ students: StudentResult[] }>(
          `/api/students?search=${encodeURIComponent(value.trim())}&limit=8`,
        );
        setStudentResults(result.students);
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  function selectStudent(s: StudentResult) {
    setSelectedStudent(s);
    setStudentSearch(s.name);
    setStudentResults([]);
  }

  function clearStudent() {
    setSelectedStudent(null);
    setStudentSearch("");
    setStudentResults([]);
  }

  // ------ Product selection ------
  function handleLectureChange(lectureId: string) {
    setSelectedLectureId(lectureId);
    if (!lectureId) {
      setItemName("");
      setGrossAmount(0);
      setDiscountAmount(0);
      return;
    }
    const found = specialLectures.find((l) => l.id === lectureId);
    if (found) {
      setItemName(found.name);
      setGrossAmount(found.price);
      setDiscountAmount(0);
    }
  }

  // ------ Reset for next payment ------
  function resetForNextPayment() {
    idempotencyKey.current = generateIdempotencyKey();
    setSuccessPaymentId(null);
    setErrorMessage(null);
    setStudentSearch("");
    setSelectedStudent(null);
    setIsNonMember(false);
    setSelectedLectureId("");
    setItemName("");
    setGrossAmount(0);
    setDiscountAmount(0);
    setMethod("CASH");
    setNote("");
  }

  // ------ Submit ------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!isNonMember && !selectedStudent) {
      setErrorMessage("학생을 검색하여 선택하거나 비회원을 체크하세요.");
      return;
    }
    if (!itemName.trim()) {
      setErrorMessage("상품명을 입력하세요.");
      return;
    }
    if (grossAmount <= 0) {
      setErrorMessage("청구금액은 0원보다 커야 합니다.");
      return;
    }
    if (netAmount <= 0) {
      setErrorMessage("실납부금액은 0원보다 커야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestJson<{ payment: { id: string } }>(
        "/api/pos/payments",
        {
          method: "POST",
          headers: { "X-Idempotency-Key": idempotencyKey.current },
          body: JSON.stringify({
            examNumber: selectedStudent?.examNumber ?? null,
            category: "SINGLE_COURSE",
            method,
            grossAmount,
            discountAmount,
            netAmount,
            note: note.trim() || null,
            items: [
              {
                itemType: "SINGLE_COURSE",
                itemId: selectedLectureId || null,
                itemName: itemName.trim(),
                unitPrice: grossAmount,
                quantity: 1,
                amount: grossAmount,
              },
            ],
          }),
        },
      );
      setSuccessPaymentId(result.payment.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "결제 처리 실패");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Success view
  // ---------------------------------------------------------------------------

  if (successPaymentId) {
    return (
      <div className="rounded-[28px] border border-forest/30 bg-forest/5 p-8 text-center">
        <div className="text-5xl">✓</div>
        <h2 className="mt-4 text-xl font-semibold text-forest">결제 완료</h2>
        <p className="mt-2 text-sm text-slate">
          {netAmount.toLocaleString()}원 결제가 정상 처리되었습니다.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href={`/admin/payments/${successPaymentId}/receipt`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-6 py-2.5 text-sm font-medium text-ember transition hover:bg-ember/20"
          >
            영수증 출력
          </a>
          <button
            type="button"
            onClick={resetForNextPayment}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            다음 결제
          </button>
          <a
            href="/admin/pos"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-6 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            목록으로
          </a>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Checkout form
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Section 1: 학생 검색 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">학생</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={isNonMember}
              onChange={(e) => {
                setIsNonMember(e.target.checked);
                if (e.target.checked) clearStudent();
              }}
              className="rounded"
            />
            비회원
          </label>
        </div>

        {!isNonMember && (
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => handleStudentSearchChange(e.target.value)}
                placeholder="이름 또는 학번으로 검색"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
                autoComplete="off"
              />
              {searchLoading && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate">
                  검색 중...
                </span>
              )}
            </div>

            {/* Search results dropdown */}
            {studentResults.length > 0 && !selectedStudent && (
              <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-md">
                {studentResults.map((s) => (
                  <button
                    key={s.examNumber}
                    type="button"
                    onClick={() => selectStudent(s)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-mist/50"
                  >
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="text-xs text-slate">{s.examNumber}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Selected student chip */}
            {selectedStudent && (
              <div className="flex items-center justify-between rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
                <div>
                  <span className="font-semibold text-ink">{selectedStudent.name}</span>
                  <span className="ml-2 text-xs text-slate">{selectedStudent.examNumber}</span>
                  {selectedStudent.phone && (
                    <span className="ml-2 text-xs text-slate">{selectedStudent.phone}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearStudent}
                  className="text-xs text-slate transition hover:text-ember"
                >
                  변경
                </button>
              </div>
            )}
          </div>
        )}

        {isNonMember && (
          <p className="text-sm text-slate">비회원으로 판매를 진행합니다.</p>
        )}
      </div>

      {/* Section 2: 상품 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">상품</h2>

        {/* Quick-select from special lectures */}
        {specialLectures.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate">빠른 선택 (특강 목록)</label>
            <select
              value={selectedLectureId}
              onChange={(e) => handleLectureChange(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
            >
              <option value="">-- 특강 선택 (선택사항) --</option>
              {specialLectures.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.price > 0 ? ` — ${l.price.toLocaleString()}원` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Item name (free text) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate">
            상품명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="ex) 헌법 단과 특강 3월"
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
            required
          />
        </div>

        {/* Amount row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate">
              청구금액 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={grossAmount || ""}
              onChange={(e) => {
                setGrossAmount(Number(e.target.value));
                setDiscountAmount(0);
              }}
              placeholder="0"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm tabular-nums outline-none focus:border-ember/40"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate">할인금액</label>
            <input
              type="number"
              min={0}
              step={1000}
              max={grossAmount}
              value={discountAmount || ""}
              onChange={(e) =>
                setDiscountAmount(Math.min(Number(e.target.value), grossAmount))
              }
              placeholder="0"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm tabular-nums outline-none focus:border-ember/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate">실납부금액</label>
            <div className="flex items-center rounded-2xl border border-forest/30 bg-forest/5 px-4 py-3">
              <span className="text-base font-bold text-forest tabular-nums">
                {netAmount.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: 결제수단 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">결제수단</h2>

        <div className="grid grid-cols-3 gap-3">
          {METHOD_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-4 text-sm font-medium transition ${
                method === m.value
                  ? "border-ember/40 bg-ember/10 text-ember"
                  : "border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
              }`}
            >
              <span className="text-2xl">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate">메모 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="특이사항"
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ember/40"
          />
        </div>
      </div>

      {/* Error */}
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Submit summary + button */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate">
              {selectedStudent ? (
                <span>
                  <strong className="text-ink">{selectedStudent.name}</strong>
                  <span className="ml-1.5 text-xs">({selectedStudent.examNumber})</span>
                </span>
              ) : isNonMember ? (
                <span className="text-slate">비회원</span>
              ) : (
                <span className="text-slate/60">학생 미선택</span>
              )}
              {itemName ? (
                <>
                  {" · "}
                  <span className="text-ink">{itemName}</span>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-2xl font-bold text-ember tabular-nums">
              {netAmount.toLocaleString()}원
              <span className="ml-2 text-sm font-medium text-slate">
                {METHOD_OPTIONS.find((m) => m.value === method)?.label}
              </span>
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-8 py-3 text-sm font-bold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "처리 중..." : "결제 처리"}
          </button>
        </div>
      </div>
    </form>
  );
}
