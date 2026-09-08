"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type StudentOption = {
  id: string;
  studentNumber: string;
  name: string;
  studyTrack?: string | null;
};

type StudentSearchComboboxProps = {
  students: StudentOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** 비어있는 값을 나타내는 라벨. 지정하면 목록 상단에 "전체" 옵션이 표시됩니다. */
  allStudentsLabel?: string;
  showStudyTrack?: boolean;
  className?: string;
};

export function StudentSearchCombobox({
  students,
  value,
  onChange,
  placeholder = "이름 또는 수험번호 검색",
  allStudentsLabel,
  showStudyTrack = false,
  className = "",
}: StudentSearchComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelCloseTimer() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  useEffect(() => cancelCloseTimer, []);

  const selected = useMemo(() => students.find((s) => s.id === value), [students, value]);
  const displayValue = open
    ? query
    : selected
    ? `${selected.studentNumber} · ${selected.name}${showStudyTrack && selected.studyTrack ? ` · ${selected.studyTrack}` : ""}`
    : allStudentsLabel
    ? allStudentsLabel
    : "";

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return students.filter((s) =>
      s.name.toLowerCase().includes(q) || s.studentNumber.toLowerCase().includes(q),
    );
  }, [students, query]);

  function handleSelect(id: string) {
    cancelCloseTimer();
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className={`relative ${className}`}>
      <div className="admin-input-group">
        <Search className="h-5 w-5 shrink-0 text-admin-text-muted" />
        <input
          type="text"
          value={displayValue}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            cancelCloseTimer();
            setQuery("");
            setOpen(true);
          }}
          onBlur={() => {
            cancelCloseTimer();
            closeTimerRef.current = setTimeout(() => {
              closeTimerRef.current = null;
              setOpen(false);
            }, 150);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-slate-700 placeholder-slate-400"
        />
      </div>

      {open && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {allStudentsLabel && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect("")}
                className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${ value === "" ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-500" }`}
              >
                {allStudentsLabel}
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-400">검색 결과가 없습니다.</li>
          ) : (
            filtered.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(student.id)}
                  className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${ value === student.id ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700" }`}
                >
                  {student.studentNumber} · {student.name}
                  {showStudyTrack && student.studyTrack ? ` · ${student.studyTrack}` : ""}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
