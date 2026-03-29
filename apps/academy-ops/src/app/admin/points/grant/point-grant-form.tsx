"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

type StudentInfo = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type StudentData = {
  student: StudentInfo;
  balance: number;
};

type SearchResult = {
  examNumber: string;
  name: string;
  phone: string;
};

type PointPolicy = {
  id: number;
  name: string;
  description: string | null;
  defaultAmount: number;
};

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "요청에 실패했습니다.");
  return data as T;
}

// ───────────────────────────────────────────────────────────────────────
// Student search autocomplete
// ───────────────────────────────────────────────────────────────────────

type SearchDropdownProps = {
  onSelect: (student: StudentData) => void;
};

function StudentSearchDropdown({ onSelect }: SearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchStudents = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsSearching(true);
    try {
      const data = await fetchJson<{ students: SearchResult[] }>(
        `/api/students/search?q=${encodeURIComponent(q)}&limit=8`,
      );
      setResults(data.students ?? []);
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void searchStudents(q), 300);
  }

  async function handleSelect(s: SearchResult) {
    setQuery(`${s.name} (${s.examNumber})`);
    setResults([]);
    setIsOpen(false);
    // Fetch full data with balance
    try {
      const data = await fetchJson<StudentData>(
        `/api/points/student/${encodeURIComponent(s.examNumber)}`,
      );
      onSelect(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "학생 정보 조회 실패");
    }
  }

  // Close on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="학번 또는 이름으로 검색 (2자 이상)"
          className="flex-1 border border-[#D1D5DB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
          autoFocus
        />
        {isSearching && (
          <span className="self-center text-xs text-[#9CA3AF] whitespace-nowrap">검색 중…</span>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden">
          {results.map((s) => (
            <li key={s.examNumber}>
              <button
                type="button"
                onClick={() => void handleSelect(s)}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-[#F7F4EF] transition-colors"
              >
                <span className="font-medium text-[#111827]">{s.name}</span>
                <span className="text-xs text-[#4B5563]">{s.examNumber}</span>
                {s.phone && <span className="text-xs text-[#9CA3AF] ml-auto">{s.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && results.length === 0 && query.length >= 2 && !isSearching && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg px-4 py-3 text-sm text-[#9CA3AF]">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Main form component
// ───────────────────────────────────────────────────────────────────────

export function PointGrantForm() {
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [mode, setMode] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [periodName, setPeriodName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  // Policy selector state
  const [policies, setPolicies] = useState<PointPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | "manual">("manual");
  const [policiesLoaded, setPoliciesLoaded] = useState(false);

  // Load active policies once
  useEffect(() => {
    async function loadPolicies() {
      try {
        const res = await fetch("/api/points/policies");
        if (res.ok) {
          const data = await res.json() as { policies: PointPolicy[] };
          setPolicies((data.policies ?? []).filter((p: PointPolicy & { isActive?: boolean }) => p.isActive !== false));
        }
      } catch {
        // silently ignore — policy selector is optional UX
      } finally {
        setPoliciesLoaded(true);
      }
    }
    void loadPolicies();
  }, []);

  function handlePolicySelect(value: string) {
    if (value === "manual") {
      setSelectedPolicyId("manual");
      return;
    }
    const id = Number(value);
    const policy = policies.find((p) => p.id === id);
    if (!policy) return;
    setSelectedPolicyId(id);
    setAmount(String(policy.defaultAmount));
    setReason(policy.name + (policy.description ? ` — ${policy.description}` : ""));
    setError(null);
  }

  function handleStudentSelect(data: StudentData) {
    setStudentData(data);
    setAmount("");
    setReason("");
    setError(null);
  }

  function handleReset() {
    setStudentData(null);
    setAmount("");
    setReason("");
    setPeriodName("");
    setSelectedPolicyId("manual");
    setError(null);
  }

  function handleSubmit() {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
      setError("포인트는 양의 정수여야 합니다.");
      return;
    }
    if (!reason.trim()) {
      setError("사유를 입력하세요.");
      return;
    }
    if (!studentData) return;
    setError(null);

    const finalAmount = mode === "deduct" ? -numAmount : numAmount;

    startSubmit(async () => {
      try {
        await fetchJson("/api/points/adjust", {
          method: "POST",
          body: JSON.stringify({
            examNumber: studentData.student.examNumber,
            amount: finalAmount,
            reason: reason.trim(),
          }),
        });

        // Refresh balance
        const refreshed = await fetchJson<StudentData>(
          `/api/points/student/${encodeURIComponent(studentData.student.examNumber)}`,
        );
        setStudentData(refreshed);
        setAmount("");
        setReason("");
        setPeriodName("");
        toast.success(
          mode === "grant"
            ? `${numAmount.toLocaleString()}P 지급 완료`
            : `${numAmount.toLocaleString()}P 차감 완료`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리 실패");
      }
    });
  }

  const numAmount = Number(amount);
  const isAmountValid = Number.isFinite(numAmount) && numAmount > 0 && Number.isInteger(numAmount);
  const canSubmit = !!studentData && isAmountValid && !!reason.trim() && !isSubmitting;

  return (
    <div className="space-y-5">
      {/* ── 학생 검색 ── */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
        <h2 className="text-sm font-semibold text-[#111827] mb-1">학생 검색</h2>
        <p className="text-xs text-[#4B5563] mb-3">이름 또는 학번으로 검색하고 선택하세요.</p>
        <StudentSearchDropdown onSelect={handleStudentSelect} />
      </div>

      {/* ── 선택된 학생 정보 ── */}
      {studentData && (
        <>
          <div className="bg-[#F7F4EF] border border-[#E5E7EB] rounded-[28px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-[#111827]">
                  {studentData.student.name}
                  <span className="ml-2 text-sm font-normal text-[#4B5563]">
                    ({studentData.student.examNumber})
                  </span>
                </p>
                {studentData.student.phone && (
                  <p className="mt-0.5 text-sm text-[#4B5563]">{studentData.student.phone}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-[#4B5563]">현재 잔액</p>
                <p className="text-2xl font-bold text-[#1F4D3A]">
                  {studentData.balance.toLocaleString()}P
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 text-xs text-[#9CA3AF] hover:text-[#C55A11] transition-colors"
            >
              다른 학생 검색
            </button>
          </div>

          {/* ── 지급/차감 폼 ── */}
          <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
            <h2 className="text-sm font-semibold text-[#111827] mb-4">포인트 지급 / 차감</h2>

            {/* 지급·차감 토글 */}
            <div className="flex rounded-xl overflow-hidden border border-[#E5E7EB] w-fit mb-5">
              <button
                type="button"
                onClick={() => { setMode("grant"); setError(null); }}
                className={`px-6 py-2 text-sm font-medium transition-colors ${
                  mode === "grant"
                    ? "bg-[#1F4D3A] text-white"
                    : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
                }`}
              >
                지급
              </button>
              <button
                type="button"
                onClick={() => { setMode("deduct"); setError(null); }}
                className={`px-6 py-2 text-sm font-medium transition-colors ${
                  mode === "deduct"
                    ? "bg-red-600 text-white"
                    : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
                }`}
              >
                차감
              </button>
            </div>

            <div className="space-y-4">
              {/* 포인트 정책 선택 (지급 모드에서만 표시) */}
              {mode === "grant" && policiesLoaded && policies.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#4B5563] mb-1">
                    지급 정책 선택{" "}
                    <span className="text-[#9CA3AF] font-normal">(선택하면 금액·사유 자동 입력)</span>
                  </label>
                  <select
                    value={String(selectedPolicyId)}
                    onChange={(e) => handlePolicySelect(e.target.value)}
                    className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                  >
                    <option value="manual">직접 입력</option>
                    {policies.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} — {p.defaultAmount.toLocaleString()}P
                        {p.description ? ` (${p.description})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 포인트 금액 */}
              <div>
                <label className="block text-xs font-medium text-[#4B5563] mb-1">
                  포인트 (P) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예: 100"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
                {mode === "deduct" && isAmountValid && studentData.balance < numAmount && (
                  <p className="mt-1 text-xs text-amber-600">
                    현재 잔액({studentData.balance.toLocaleString()}P)보다 차감 금액이 큽니다.
                  </p>
                )}
              </div>

              {/* 사유 */}
              <div>
                <label className="block text-xs font-medium text-[#4B5563] mb-1">
                  사유 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 3월 우수학생 포인트 지급"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
              </div>

              {/* 기간명 (optional) */}
              <div>
                <label className="block text-xs font-medium text-[#4B5563] mb-1">
                  기간명{" "}
                  <span className="text-[#9CA3AF] font-normal">(선택 — 어느 학습 기간인지 메모)</span>
                </label>
                <input
                  type="text"
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                  placeholder="예: 2026-03 기수"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {/* 예상 결과 */}
              {isAmountValid && (
                <div className="rounded-xl bg-[#F7F4EF] px-4 py-3 text-sm">
                  <span className="text-[#4B5563]">처리 후 예상 잔액: </span>
                  <span className="font-bold text-[#1F4D3A]">
                    {(
                      studentData.balance + (mode === "grant" ? numAmount : -numAmount)
                    ).toLocaleString()}
                    P
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  mode === "deduct"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#C55A11] hover:bg-[#A04810]"
                }`}
              >
                {isSubmitting
                  ? "처리 중…"
                  : isAmountValid
                  ? mode === "grant"
                    ? `${numAmount.toLocaleString()}P 지급`
                    : `${numAmount.toLocaleString()}P 차감`
                  : mode === "grant"
                  ? "포인트 지급"
                  : "포인트 차감"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
