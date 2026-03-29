"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

type StudentInfo = {
  id: string;
  name: string;
  examNumber: string;
  mobile: string;
};

type PointLogEntry = {
  id: number;
  type: string;
  amount: number;
  reason: string;
  grantedBy: string;
  createdAt: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

type StudentData = {
  student: StudentInfo;
  balance: number;
  logs: PointLogEntry[];
};

type SearchStudent = {
  examNumber: string;
  name: string;
  phone: string;
};

const TYPE_LABEL: Record<string, string> = {
  ATTENDANCE: "출석",
  MANUAL: "수동",
  EXAM_SCORE: "성적",
  REFERRAL: "추천",
  EVENT: "이벤트",
  DEDUCTION: "차감",
  EXPIRE: "만료",
  SPEND: "사용",
};

// ───────────────────────────────────────────────
// 개별 지급 탭
// ───────────────────────────────────────────────
function SingleAdjustTab() {
  const [searchInput, setSearchInput] = useState("");
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();

  const [mode, setMode] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isAdjusting, startAdjust] = useTransition();

  function handleSearch() {
    const q = searchInput.trim();
    if (!q) return;
    setSearchError(null);
    setStudentData(null);
    setAdjustError(null);

    startSearch(async () => {
      try {
        const data = await requestJson<StudentData>(`/api/points/student/${encodeURIComponent(q)}`);
        setStudentData(data);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "조회 실패");
      }
    });
  }

  function handleAdjust() {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setAdjustError("금액은 양수 숫자여야 합니다.");
      return;
    }
    if (!reason.trim()) {
      setAdjustError("사유를 입력하세요.");
      return;
    }
    if (!studentData) return;

    setAdjustError(null);

    const finalAmount = mode === "deduct" ? -numAmount : numAmount;

    startAdjust(async () => {
      try {
        await requestJson("/api/points/adjust", {
          method: "POST",
          body: JSON.stringify({
            examNumber: studentData.student.examNumber,
            amount: finalAmount,
            reason: reason.trim(),
          }),
        });

        // Refresh student data
        const refreshed = await requestJson<StudentData>(
          `/api/points/student/${encodeURIComponent(studentData.student.examNumber)}`,
        );
        setStudentData(refreshed);
        setAmount("");
        setReason("");
        toast.success(`${mode === "grant" ? "지급" : "차감"} 완료: ${Math.abs(finalAmount).toLocaleString()}P`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 학생 검색 */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
        <h2 className="text-sm font-semibold text-[#111827] mb-3">학생 검색</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="학번 또는 이름 입력"
            className="flex-1 border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2 bg-[#C55A11] text-white text-sm rounded-xl hover:bg-[#A04810] disabled:opacity-50 transition-colors"
          >
            {isSearching ? "조회 중…" : "조회"}
          </button>
        </div>
        {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}
      </div>

      {/* 학생 정보 + 잔액 */}
      {studentData && (
        <>
          <div className="bg-[#F7F4EF] border border-[#E5E7EB] rounded-[28px] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-[#111827]">
                  {studentData.student.name}
                  <span className="text-sm font-normal text-[#4B5563] ml-2">
                    ({studentData.student.examNumber})
                  </span>
                </p>
                <p className="text-sm text-[#4B5563]">{studentData.student.mobile}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#4B5563]">현재 잔액</p>
                <p className="text-2xl font-bold text-[#1F4D3A]">
                  {studentData.balance.toLocaleString()}P
                </p>
              </div>
            </div>
          </div>

          {/* 조정 폼 */}
          <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
            <h2 className="text-sm font-semibold text-[#111827] mb-4">포인트 조정</h2>

            {/* 지급/차감 탭 */}
            <div className="flex rounded-xl overflow-hidden border border-[#E5E7EB] mb-4 w-fit">
              <button
                onClick={() => { setMode("grant"); setAdjustError(null); }}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === "grant"
                    ? "bg-[#1F4D3A] text-white"
                    : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
                }`}
              >
                지급
              </button>
              <button
                onClick={() => { setMode("deduct"); setAdjustError(null); }}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === "deduct"
                    ? "bg-red-600 text-white"
                    : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
                }`}
              >
                차감
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#4B5563] mb-1 block">금액 (P)</label>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예: 100"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#4B5563] mb-1 block">사유</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="포인트 조정 사유를 입력하세요"
                  className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
                />
              </div>

              {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}

              {mode === "deduct" && Number(amount) > 0 && studentData.balance < Number(amount) && (
                <p className="text-xs text-amber-600">
                  잔액({studentData.balance.toLocaleString()}P)이 차감 금액보다 적습니다.
                </p>
              )}

              <button
                onClick={handleAdjust}
                disabled={isAdjusting || !amount || !reason.trim()}
                className={`w-full py-2.5 text-sm font-medium rounded-xl text-white transition-colors disabled:opacity-50 ${
                  mode === "deduct"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#C55A11] hover:bg-[#A04810]"
                }`}
              >
                {isAdjusting
                  ? "처리 중…"
                  : mode === "grant"
                  ? `${amount ? Number(amount).toLocaleString() : "0"}P 지급`
                  : `${amount ? Number(amount).toLocaleString() : "0"}P 차감`}
              </button>
            </div>
          </div>

          {/* 최근 이력 */}
          <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
            <h2 className="text-sm font-semibold text-[#111827] mb-4">
              최근 이력 ({studentData.logs.length}건)
            </h2>
            {studentData.logs.length === 0 ? (
              <p className="text-sm text-[#4B5563]">포인트 이력이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {studentData.logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#111827] truncate">{log.reason}</p>
                      <p className="text-xs text-[#9CA3AF]">
                        {TYPE_LABEL[log.type] ?? log.type} · {log.grantedBy} ·{" "}
                        {new Date(log.createdAt).toLocaleDateString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold ml-3 ${
                        log.amount >= 0 ? "text-[#1F4D3A]" : "text-red-600"
                      }`}
                    >
                      {log.amount >= 0 ? "+" : ""}
                      {log.amount.toLocaleString()}P
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────
// 학생 검색 드롭다운 (일괄 지급용)
// ───────────────────────────────────────────────
type BulkSearchDropdownProps = {
  onAdd: (student: SearchStudent) => void;
  alreadyAdded: Set<string>;
};

function BulkSearchDropdown({ onAdd, alreadyAdded }: BulkSearchDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchStudent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json() as { students: SearchStudent[] };
      setResults(data.students ?? []);
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void search(q); }, 300);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(student: SearchStudent) {
    onAdd(student);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="이름 또는 학번으로 검색 (2자 이상)"
          className="flex-1 border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
        />
        {isLoading && (
          <span className="text-xs text-[#9CA3AF]">검색 중…</span>
        )}
      </div>
      {isOpen && results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden">
          {results.map((s) => {
            const already = alreadyAdded.has(s.examNumber);
            return (
              <li key={s.examNumber}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => handleSelect(s)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                    already
                      ? "bg-[#F3F4F6] text-[#9CA3AF] cursor-default"
                      : "hover:bg-[#F7F4EF] text-[#111827]"
                  }`}
                >
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-[#4B5563] ml-2 text-xs">({s.examNumber})</span>
                  </span>
                  {already && <span className="text-xs text-[#9CA3AF]">추가됨</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {isOpen && results.length === 0 && query.length >= 2 && !isLoading && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg px-4 py-3 text-sm text-[#9CA3AF]">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────
// 일괄 지급 탭
// ───────────────────────────────────────────────
function BulkGrantTab() {
  const [students, setStudents] = useState<SearchStudent[]>([]);
  const [textareaValue, setTextareaValue] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  // Derive set of already-added exam numbers (for dedup in search)
  const addedSet = new Set(students.map((s) => s.examNumber));

  function handleAddFromSearch(student: SearchStudent) {
    if (!addedSet.has(student.examNumber)) {
      setStudents((prev) => [...prev, student]);
    }
  }

  function handleRemoveStudent(examNumber: string) {
    setStudents((prev) => prev.filter((s) => s.examNumber !== examNumber));
  }

  function handleAddFromTextarea() {
    const lines = textareaValue
      .split(/[\n,;\s]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    // Add unique new exam numbers as placeholder entries (name unknown until API resolves)
    const newEntries: SearchStudent[] = [];
    for (const examNumber of lines) {
      if (!addedSet.has(examNumber)) {
        newEntries.push({ examNumber, name: "확인 중", phone: "" });
      }
    }
    setStudents((prev) => [...prev, ...newEntries]);
    setTextareaValue("");
  }

  async function handleSubmit() {
    setValidationError(null);

    if (students.length === 0) {
      setValidationError("대상 학생을 1명 이상 추가하세요.");
      return;
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
      setValidationError("지급 포인트는 양의 정수여야 합니다.");
      return;
    }
    if (reason.trim().length < 5) {
      setValidationError("사유는 5자 이상 입력하세요.");
      return;
    }

    const confirmed = window.confirm(
      `${students.length}명에게 각 ${numAmount.toLocaleString()}포인트를 지급합니다.\n계속하시겠습니까?`,
    );
    if (!confirmed) return;

    startSubmit(async () => {
      try {
        const result = await requestJson<{ data: { count: number; message: string } }>(
          "/api/points/bulk",
          {
            method: "POST",
            body: JSON.stringify({
              examNumbers: students.map((s) => s.examNumber),
              amount: numAmount,
              reason: reason.trim(),
            }),
          },
        );
        toast.success(result.data.message);
        // Clear form
        setStudents([]);
        setAmount("");
        setReason("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* 검색으로 추가 */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
        <h2 className="text-sm font-semibold text-[#111827] mb-1">검색으로 추가</h2>
        <p className="text-xs text-[#4B5563] mb-3">이름 또는 학번으로 학생을 검색해 목록에 추가합니다.</p>
        <BulkSearchDropdown onAdd={handleAddFromSearch} alreadyAdded={addedSet} />
      </div>

      {/* 학번 직접 입력 */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6">
        <h2 className="text-sm font-semibold text-[#111827] mb-1">학번 직접 입력</h2>
        <p className="text-xs text-[#4B5563] mb-3">학번을 공백·줄바꿈·쉼표로 구분해 여러 개 입력 후 추가합니다.</p>
        <textarea
          value={textareaValue}
          onChange={(e) => setTextareaValue(e.target.value)}
          rows={4}
          placeholder={"예:\n2025001\n2025002\n2025003"}
          className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40 resize-none"
        />
        <button
          type="button"
          onClick={handleAddFromTextarea}
          disabled={!textareaValue.trim()}
          className="mt-2 px-4 py-2 border border-[#C55A11] text-[#C55A11] text-sm rounded-xl hover:bg-[#FFF4EE] disabled:opacity-40 transition-colors"
        >
          목록에 추가
        </button>
      </div>

      {/* 선택된 학생 목록 */}
      <div className="bg-[#F7F4EF] border border-[#E5E7EB] rounded-[28px] p-6">
        <h2 className="text-sm font-semibold text-[#111827] mb-3">
          선택된 학생{" "}
          <span className="text-[#C55A11] font-bold">{students.length}명</span>
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-[#9CA3AF]">위에서 학생을 추가하세요.</p>
        ) : (
          <ul className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {students.map((s) => (
              <li key={s.examNumber} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-[#111827]">{s.name}</span>
                  <span className="text-[#4B5563] ml-2 text-xs">({s.examNumber})</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveStudent(s.examNumber)}
                  className="ml-3 text-[#9CA3AF] hover:text-red-600 transition-colors text-base leading-none"
                  aria-label="제거"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {students.length > 0 && (
          <button
            type="button"
            onClick={() => setStudents([])}
            className="mt-3 text-xs text-[#9CA3AF] hover:text-red-600 transition-colors"
          >
            전체 초기화
          </button>
        )}
      </div>

      {/* 지급 설정 */}
      <div className="bg-white border border-[#E5E7EB] rounded-[28px] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-[#111827]">지급 설정</h2>

        <div>
          <label className="text-xs font-medium text-[#4B5563] mb-1 block">지급 포인트 (P)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="예: 100"
            className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#4B5563] mb-1 block">
            지급 사유 <span className="text-[#9CA3AF]">(5자 이상)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 3월 우수학생 포인트 지급"
            className="w-full border border-[#D1D5DB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C55A11]/40"
          />
        </div>

        {validationError && (
          <p className="text-sm text-red-600">{validationError}</p>
        )}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || students.length === 0 || !amount || !reason.trim()}
          className="w-full py-2.5 text-sm font-semibold rounded-xl text-white bg-[#C55A11] hover:bg-[#A04810] disabled:opacity-50 transition-colors"
        >
          {isSubmitting
            ? "처리 중…"
            : students.length > 0 && amount
            ? `${students.length}명에게 ${Number(amount) > 0 ? Number(amount).toLocaleString() : "0"}P 일괄 지급`
            : "일괄 지급 실행"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// 메인 컴포넌트 (탭 전환)
// ───────────────────────────────────────────────
export function PointAdjustManager() {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  return (
    <div className="space-y-4">
      {/* 탭 헤더 */}
      <div className="flex rounded-xl overflow-hidden border border-[#E5E7EB] w-fit">
        <button
          onClick={() => setActiveTab("single")}
          className={`px-6 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "single"
              ? "bg-[#1F4D3A] text-white"
              : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
          }`}
        >
          개별 지급
        </button>
        <button
          onClick={() => setActiveTab("bulk")}
          className={`px-6 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "bulk"
              ? "bg-[#1F4D3A] text-white"
              : "bg-white text-[#4B5563] hover:bg-[#F7F4EF]"
          }`}
        >
          일괄 지급
        </button>
      </div>

      {activeTab === "single" ? <SingleAdjustTab /> : <BulkGrantTab />}
    </div>
  );
}
