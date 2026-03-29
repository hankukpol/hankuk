"use client";

import { useCallback, useRef, useState } from "react";

type PeriodOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type StudentSearchResult = {
  examNumber: string;
  name: string;
  phone: string | null;
};

type EnrollResult = {
  enrolled: number;
  skipped: number;
  notFound: string[];
};

function formatDate(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function SingleEnrollSection({ periodId, onSuccess }: { periodId: number; onSuccess: () => void }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [selected, setSelected] = useState<StudentSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setSelected(null);
    setResult(null);
    setError(null);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}&limit=8`);
        const payload = (await response.json()) as { students?: StudentSearchResult[] };
        setSearchResults(payload.students ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleSelect = useCallback((student: StudentSearchResult) => {
    setSelected(student);
    setQuery(student.name);
    setSearchResults([]);
    setResult(null);
    setError(null);
  }, []);

  const handleEnroll = useCallback(async () => {
    if (!selected || !periodId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/exams/morning/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, examNumber: selected.examNumber }),
      });
      const payload = (await response.json()) as { data?: EnrollResult; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "등록에 실패했습니다.");
      }

      setResult(payload.data ?? { enrolled: 0, skipped: 0, notFound: [] });
      setQuery("");
      setSelected(null);
      setSearchResults([]);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }, [onSuccess, periodId, selected]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">개별 등록</h3>

      <div className="relative">
        <input
          type="text"
          placeholder="이름 또는 학번 검색 (2자 이상)"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          className="w-full rounded-xl border border-ink/15 bg-mist px-4 py-2.5 text-sm focus:border-forest focus:outline-none"
          autoComplete="off"
        />
        {isSearching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">검색 중...</span>
        )}

        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-ink/15 bg-white shadow-lg">
            {searchResults.map((student) => (
              <button
                key={student.examNumber}
                type="button"
                onClick={() => handleSelect(student)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-mist/60 first:rounded-t-xl last:rounded-b-xl"
              >
                <span className="font-mono text-xs font-semibold text-forest">{student.examNumber}</span>
                <span className="font-medium text-ink">{student.name}</span>
                {student.phone && <span className="ml-auto text-xs text-slate">{student.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-3 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3">
          <span className="font-mono text-sm font-bold text-forest">{selected.examNumber}</span>
          <span className="font-semibold text-ink">{selected.name}</span>
          {selected.phone && <span className="text-xs text-slate">{selected.phone}</span>}
          <button
            type="button"
            onClick={handleEnroll}
            disabled={isSubmitting}
            className="ml-auto inline-flex items-center rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
          >
            {isSubmitting ? "등록 중..." : "등록"}
          </button>
        </div>
      )}

      {result && (
        <div
          className={
            result.enrolled > 0
              ? "rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-forest"
              : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          }
        >
          {result.enrolled > 0 ? `${result.enrolled}명 등록 완료` : "이미 등록된 수강생입니다."}
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}

function BulkEnrollSection({ periodId, onSuccess }: { periodId: number; onSuccess: () => void }) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedExamNumbers = text
    .split(/[\n,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const handleBulkEnroll = useCallback(async () => {
    if (parsedExamNumbers.length === 0) {
      setError("학번을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/exams/morning/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, examNumbers: parsedExamNumbers }),
      });
      const payload = (await response.json()) as { data?: EnrollResult; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "등록에 실패했습니다.");
      }

      setResult(payload.data ?? { enrolled: 0, skipped: 0, notFound: [] });
      setText("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }, [onSuccess, parsedExamNumbers, periodId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">일괄 등록</h3>
        <span className="text-xs text-slate">학번은 줄바꿈, 공백, 쉼표로 구분할 수 있습니다.</span>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
          setError(null);
        }}
        placeholder={"20240001\n20240002\n20240003"}
        rows={6}
        className="w-full rounded-xl border border-ink/15 bg-mist px-4 py-3 font-mono text-sm focus:border-forest focus:outline-none"
      />

      {parsedExamNumbers.length > 0 && (
        <p className="text-xs text-slate">{parsedExamNumbers.length}개의 학번이 입력되었습니다.</p>
      )}

      <button
        type="button"
        onClick={handleBulkEnroll}
        disabled={isSubmitting || parsedExamNumbers.length === 0}
        className="inline-flex items-center rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
      >
        {isSubmitting ? "등록 중..." : `${parsedExamNumbers.length}명 일괄 등록`}
      </button>

      {result && (
        <div className="rounded-xl border border-forest/20 bg-forest/5 px-4 py-4 text-sm">
          <p className="font-semibold text-forest">등록 완료</p>
          <ul className="mt-2 space-y-1 text-ink">
            <li>신규 등록: {result.enrolled}명</li>
            <li>기존 등록 건너뜀: {result.skipped}명</li>
            {result.notFound.length > 0 && (
              <li className="text-red-600">미조회 학번 ({result.notFound.length}명): {result.notFound.join(", ")}</li>
            )}
          </ul>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}

export function EnrollForm({ periods }: { periods: PeriodOption[] }) {
  const defaultPeriod = periods.find((period) => period.isActive) ?? periods[0];
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(defaultPeriod?.id ?? 0);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const handleSuccess = useCallback(() => setRefreshKey((value) => value + 1), []);

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ink">시험 기간 선택</span>
          <select
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(Number(event.target.value))}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " [현재]" : ""}
              </option>
            ))}
          </select>
          {selectedPeriod && (
            <span className="text-xs text-slate">{formatDate(selectedPeriod.startDate)} ~ {formatDate(selectedPeriod.endDate)}</span>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <SingleEnrollSection key={`single-${refreshKey}`} periodId={selectedPeriodId} onSuccess={handleSuccess} />
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <BulkEnrollSection key={`bulk-${refreshKey}`} periodId={selectedPeriodId} onSuccess={handleSuccess} />
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-mist/60 px-6 py-5 text-sm text-slate">
        <p className="font-semibold text-ink">안내</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>이미 등록된 수강생은 중복 등록되지 않습니다.</li>
          <li>비활성 학생이나 휴원 처리된 학생은 등록할 수 없습니다.</li>
          <li>등록 후에는 수강 현황 화면에서 결과를 바로 확인할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}
