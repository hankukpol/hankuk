"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type StudentResult = {
  examNumber: string;
  name: string;
  phone: string | null;
};

export function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/students/search?q=${encodeURIComponent(query.trim())}&limit=5`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { students?: StudentResult[] };
          setResults(data.students ?? []);
          setOpen(true);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(examNumber: string) {
    setQuery("");
    setResults([]);
    setOpen(false);
    router.push(`/admin/students/${examNumber}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setResults([]);
      setOpen(false);
    }
    if (e.key === "Enter" && query.trim()) {
      router.push(`/admin/students?search=${encodeURIComponent(query.trim())}`);
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <div className="relative px-3 py-2">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-white/30">
        <svg
          className="h-3.5 w-3.5 shrink-0 text-white/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="학생 검색..."
          className="flex-1 bg-transparent text-xs text-white/80 outline-none placeholder:text-white/30"
        />
        {loading ? (
          <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-lg">
          {results.map((student) => (
            <button
              key={student.examNumber}
              type="button"
              onMouseDown={() => handleSelect(student.examNumber)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-mist"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">
                  {student.name}
                </div>
                <div className="text-xs text-slate">{student.examNumber}</div>
              </div>
            </button>
          ))}
          <button
            type="button"
            onMouseDown={() => {
              router.push(
                `/admin/students?search=${encodeURIComponent(query.trim())}`,
              );
              setQuery("");
              setOpen(false);
            }}
            className="flex w-full items-center justify-center border-t border-ink/10 px-4 py-2 text-xs text-ember transition hover:bg-mist"
          >
            전체 결과 보기
          </button>
        </div>
      ) : null}
    </div>
  );
}
