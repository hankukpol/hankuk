"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = { id: number; name: string; isActive: boolean };

type StudentInfo = { examNumber: string; name: string };

type TrendPoint = { week: number; avg: number | null };

type StudentTrend = {
  examNumber: string;
  name: string;
  trend: TrendPoint[];
  avgScore: number | null;
  maxScore: number | null;
  minScore: number | null;
};

type ApiData = {
  periods: Period[];
  students: StudentTrend[];
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  periods: Period[];
  initialPeriodId: number | null;
  initialExamNumbers: string[];
  initialStudents: StudentInfo[];
};

// ─── Color palette (up to 5 students) ────────────────────────────────────────

const STUDENT_COLORS = ["#C55A11", "#1F4D3A", "#2563EB", "#9333EA", "#D97706"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null, digits = 1): string {
  if (v === null) return "-";
  return v.toFixed(digits);
}

// ─── Student Search Component ─────────────────────────────────────────────────

function StudentSearch({
  onAdd,
  disabled,
}: {
  onAdd: (student: StudentInfo) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: q, pageSize: "8", activeOnly: "false" });
      const res = await fetch(`/api/students?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json() as { students: StudentInfo[] };
      setResults(json.students ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(val), 280);
  };

  const handleSelect = (s: StudentInfo) => {
    onAdd(s);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="학번 또는 이름 검색…"
        disabled={disabled}
        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/50 disabled:opacity-50"
      />
      {searching && (
        <div className="absolute right-3 top-3 text-xs text-slate">검색 중…</div>
      )}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-lg">
          {results.map((s) => (
            <li key={s.examNumber}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-mist"
              >
                <span className="font-mono text-xs text-slate">{s.examNumber}</span>
                <span className="font-medium text-ink">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ students }: { students: StudentTrend[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {students.map((s, idx) => (
        <div
          key={s.examNumber}
          className="rounded-[20px] border border-ink/10 bg-white p-5"
          style={{ borderTopColor: STUDENT_COLORS[idx] ?? "#C55A11", borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: STUDENT_COLORS[idx] ?? "#C55A11" }}
            />
            <Link
              href={`/admin/students/${s.examNumber}`}
              className="text-sm font-semibold text-ink hover:text-ember"
            >
              {s.name}
            </Link>
          </div>
          <p className="mt-0.5 font-mono text-xs text-slate">{s.examNumber}</p>
          <div className="mt-3 grid grid-cols-3 gap-1 text-center">
            <div>
              <p className="text-[10px] text-slate">평균</p>
              <p className="text-sm font-bold text-ink">{fmt(s.avgScore)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate">최고</p>
              <p className="text-sm font-bold text-forest">{fmt(s.maxScore)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate">최저</p>
              <p className="text-sm font-bold text-ember">{fmt(s.minScore)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Trend LineChart ──────────────────────────────────────────────────────────

function TrendChart({ students }: { students: StudentTrend[] }) {
  if (students.length === 0) return null;

  // Build unified week list
  const allWeeks = [...new Set(students.flatMap((s) => s.trend.map((t) => t.week)))].sort(
    (a, b) => a - b,
  );

  const chartData = allWeeks.map((week) => {
    const row: Record<string, number | null | string> = { week: `${week}주` };
    for (const s of students) {
      const point = s.trend.find((t) => t.week === week);
      row[s.examNumber] = point?.avg ?? null;
    }
    return row;
  });

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-ink">주차별 성적 추이</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#4B5563" }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#4B5563" }} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
            formatter={(value, name) => {
              const s = students.find((st) => st.examNumber === String(name));
              return [value !== null ? `${Number(value).toFixed(1)}점` : "-", s?.name ?? String(name)];
            }}
          />
          <Legend
            formatter={(value) => {
              const s = students.find((st) => st.examNumber === String(value));
              return s ? `${s.name} (${s.examNumber})` : String(value);
            }}
          />
          <ReferenceLine y={60} stroke="#D97706" strokeDasharray="4 4" label={{ value: "60점", position: "right", fontSize: 11, fill: "#D97706" }} />
          {students.map((s, idx) => (
            <Line
              key={s.examNumber}
              type="monotone"
              dataKey={s.examNumber}
              stroke={STUDENT_COLORS[idx] ?? "#C55A11"}
              strokeWidth={2}
              dot={{ r: 4, fill: STUDENT_COLORS[idx] ?? "#C55A11" }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ComparisonClient({
  periods,
  initialPeriodId,
  initialExamNumbers,
  initialStudents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [periodId, setPeriodId] = useState<number | null>(initialPeriodId);
  const [selectedStudents, setSelectedStudents] = useState<StudentInfo[]>(initialStudents);
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchComparison = useCallback(
    async (pid: number | null, examNums: string[]) => {
      if (pid === null || examNums.length === 0) { setData(null); return; }
      setLoading(true);
      const params = new URLSearchParams({
        periodId: String(pid),
        examNumbers: examNums.join(","),
      });
      try {
        const res = await fetch(`/api/results/comparison?${params.toString()}`);
        if (!res.ok) return;
        const json = await res.json() as { data: ApiData };
        setData(json.data);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // On mount: fetch if initial values exist
  useEffect(() => {
    if (initialPeriodId !== null && initialExamNumbers.length > 0) {
      void fetchComparison(initialPeriodId, initialExamNumbers);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddStudent = (s: StudentInfo) => {
    if (selectedStudents.length >= 5) return;
    if (selectedStudents.find((x) => x.examNumber === s.examNumber)) return;
    setSelectedStudents((prev) => [...prev, s]);
  };

  const handleRemoveStudent = (examNumber: string) => {
    setSelectedStudents((prev) => prev.filter((s) => s.examNumber !== examNumber));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const examNums = selectedStudents.map((s) => s.examNumber);
    const params = new URLSearchParams();
    if (periodId !== null) params.set("periodId", String(periodId));
    if (examNums.length > 0) params.set("examNumbers", examNums.join(","));
    startTransition(() => {
      router.push(`/admin/results/comparison?${params.toString()}`);
    });
    void fetchComparison(periodId, examNums);
  };

  const displayStudents = data?.students ?? [];

  return (
    <div className="mt-8 space-y-6">
      {/* Filter form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Period */}
          <div>
            <label className="mb-2 block text-sm font-medium">기간 선택</label>
            <select
              value={periodId ?? ""}
              onChange={(e) => setPeriodId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="">기간 선택</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isActive ? "● " : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Student search */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              학생 추가{" "}
              <span className="font-normal text-slate">({selectedStudents.length}/5)</span>
            </label>
            <StudentSearch
              onAdd={handleAddStudent}
              disabled={selectedStudents.length >= 5}
            />
          </div>
        </div>

        {/* Selected students chips */}
        {selectedStudents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedStudents.map((s, idx) => (
              <span
                key={s.examNumber}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: STUDENT_COLORS[idx] ?? "#C55A11",
                  color: STUDENT_COLORS[idx] ?? "#C55A11",
                  backgroundColor: (STUDENT_COLORS[idx] ?? "#C55A11") + "15",
                }}
              >
                {s.name} ({s.examNumber})
                <button
                  type="button"
                  onClick={() => handleRemoveStudent(s.examNumber)}
                  className="ml-0.5 hover:opacity-70"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Submit */}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={periodId === null || selectedStudents.length === 0 || isPending || loading}
            className="inline-flex items-center justify-center rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
          >
            {loading || isPending ? "조회 중..." : "비교 조회"}
          </button>
        </div>
      </form>

      {/* Results */}
      {data === null ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          기간과 학생을 선택한 뒤 비교 조회 버튼을 누르세요. (최대 5명)
        </div>
      ) : displayStudents.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          선택한 조건에 해당하는 성적 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          <SummaryCards students={displayStudents} />
          <TrendChart students={displayStudents} />
        </div>
      )}
    </div>
  );
}
