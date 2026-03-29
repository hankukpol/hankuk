"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchResult {
  submissionId: number;
  userName: string;
  examNumber: string;
  examTypeLabel: string;
  genderLabel: string;
  regionName: string;
  examLabel: string;
  totalScore: number;
  finalScore: number;
  hasCutoff: boolean;
  isSuspicious: boolean;
}

interface AdminStudentSearchBarProps {
  onSelect: (submissionId: number, label: string) => void;
  currentSubmissionId?: number;
  placeholder?: string;
}

export default function AdminStudentSearchBar({
  onSelect,
  currentSubmissionId,
  placeholder = "이름 또는 수험번호로 검색하세요.",
}: AdminStudentSearchBarProps) {
  const { enabled: submissionsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("submissions");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!currentSubmissionId) {
      setSelectedLabel("");
    }
  }, [currentSubmissionId]);

  useEffect(() => {
    if (isFeatureLoading || submissionsEnabled) {
      return;
    }

    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedLabel("");

    if (currentSubmissionId) {
      onSelect(0, "");
    }
  }, [currentSubmissionId, isFeatureLoading, onSelect, submissionsEnabled]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function handleClear() {
    setQuery("");
    setSelectedLabel("");
    setResults([]);
    setIsOpen(false);
    onSelect(0, "");
  }

  function handleSelect(result: SearchResult) {
    const label = `${result.userName} | ${result.examNumber} | ${result.examTypeLabel} (${result.genderLabel}) | ${result.regionName} | ${result.finalScore.toFixed(2)}점`;
    setSelectedLabel(label);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    onSelect(result.submissionId, label);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedLabel("");

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!submissionsEnabled || value.trim().length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/admin/search-submission?q=${encodeURIComponent(value.trim())}`,
          { cache: "no-store" }
        );
        if (response.status === 403) {
          setResults([]);
          setIsOpen(false);
          return;
        }
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
        setIsOpen(true);
      } catch {
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }

  if (isFeatureLoading) {
    return (
      <p className="text-sm text-slate-600">
        관리자 수험생 검색 사용 가능 여부를 확인하는 중입니다...
      </p>
    );
  }

  if (!submissionsEnabled) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
        제출 관리 기능이 비활성화되어 관리자 수험생 검색을 사용할 수 없습니다.
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      {selectedLabel ? (
        <div className="flex items-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2">
          <span className="flex-1 truncate text-sm text-indigo-900">{selectedLabel}</span>
          <Button
            type="button"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={handleClear}
          >
            선택 해제
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onFocus={() => {
                if (results.length > 0) {
                  setIsOpen(true);
                }
              }}
              placeholder={placeholder}
              className="h-10 text-sm"
            />
            {isLoading ? (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                검색 중...
              </span>
            ) : null}
          </div>
        </div>
      )}

      {isOpen && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((result) => (
            <button
              key={result.submissionId}
              type="button"
              className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-slate-50"
              onClick={() => handleSelect(result)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{result.userName}</span>
                <span className="text-xs text-slate-500">{result.examNumber}</span>
                {result.hasCutoff ? (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">
                    컷라인
                  </span>
                ) : null}
                {result.isSuspicious ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    주의
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-slate-500">
                {result.examLabel} | {result.examTypeLabel} ({result.genderLabel}) |{" "}
                {result.regionName} |{" "}
                <span className="font-medium text-slate-700">
                  {result.finalScore.toFixed(2)}점
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {isOpen && !isLoading && query.trim().length > 0 && results.length === 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
          <p className="text-sm text-slate-500">일치하는 제출 내역이 없습니다.</p>
        </div>
      ) : null}
    </div>
  );
}
