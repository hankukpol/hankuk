"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { ExamType, Subject } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────────────────────

type Period = { id: number; name: string; isActive: boolean };

type SessionOption = {
  id: number;
  week: number;
  subject: Subject;
  examDate: string | Date;
  examType: string;
  displaySubjectName: string | null;
};

type Stats = {
  avg: number | null;
  median: number | null;
  stddev: number | null;
  max: number | null;
  min: number | null;
};

type DistributionBucket = { range: string; count: number };

type SubjectAvg = { subject: string; label: string; avg: number; count: number };

type ApiData = {
  periods: Period[];
  sessions: SessionOption[];
  stats: Stats | null;
  distribution: DistributionBucket[];
  subjectAverages: SubjectAvg[];
};

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  periods: Period[];
  initialSessions: SessionOption[];
  initialPeriodId: number | null;
  initialSessionId: number | null;
  initialExamType: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null, digits = 1): string {
  if (v === null) return "-";
  return v.toFixed(digits);
}

function bucketColor(range: string): string {
  if (range === "91~100") return "#1F4D3A";
  if (range === "81~90") return "#2D7A5A";
  if (range === "71~80") return "#C55A11";
  if (range === "61~70") return "#D97706";
  return "#9CA3AF";
}

function subjectColor(idx: number): string {
  const COLORS = ["#1F4D3A", "#C55A11", "#2D7A5A", "#D97706", "#4B5563"];
  return COLORS[idx % COLORS.length] ?? "#4B5563";
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function KpiCards({ stats, count }: { stats: Stats; count: number }) {
  const cards = [
    { label: "응시 인원", value: `${count}명`, sub: "유효 점수 보유", color: "text-forest", bg: "bg-forest/10" },
    { label: "평균", value: `${fmt(stats.avg)}점`, sub: "전체 평균", color: "text-ember", bg: "bg-ember/10" },
    { label: "최고 / 최저", value: `${fmt(stats.max)} / ${fmt(stats.min)}`, sub: "점수 범위", color: "text-sky-700", bg: "bg-sky-50" },
    { label: "중앙값", value: `${fmt(stats.median)}점`, sub: "50번째 백분위", color: "text-purple-700", bg: "bg-purple-50" },
    { label: "표준편차", value: `${fmt(stats.stddev)}`, sub: "점수 분산 정도", color: "text-slate", bg: "bg-ink/5" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-[20px] border border-ink/10 ${c.bg} p-5`}>
          <p className="text-xs font-medium text-slate">{c.label}</p>
          <p className={`mt-1 text-xl font-bold ${c.color}`}>{c.value}</p>
          <p className="mt-1 text-xs text-slate/80">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Distribution Chart ───────────────────────────────────────────────────────

function DistributionBarChart({ data }: { data: DistributionBucket[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-ink">구간별 점수 분포</h3>
      <p className="mb-4 text-xs text-slate">학생 평균 점수 기준 — 총 {total}명</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 12, fill: "#4B5563" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#4B5563" }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
            formatter={(value) => [`${value}명`, "인원"]}
            labelFormatter={(label) => `${String(label)}점 구간`}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.range} fill={bucketColor(entry.range)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-slate">색상: 회색(50 이하) → 황색(61~70) → 주황(71~80) → 연녹(81~90) → 진녹(91+)</p>
    </div>
  );
}

// ─── Subject Averages Chart ───────────────────────────────────────────────────

function SubjectAveragesChart({ data }: { data: SubjectAvg[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-[20px] border border-ink/10 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">과목별 평균</h3>
        <p className="py-8 text-center text-sm text-slate">데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-ink">과목별 평균</h3>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 52)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#4B5563" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: "#4B5563" }} tickLine={false} axisLine={false} width={72} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 13 }}
            formatter={(value) => [`${Number(value).toFixed(1)}점`, "과목 평균"]}
          />
          <ReferenceLine x={60} stroke="#D97706" strokeDasharray="4 4" />
          <Bar dataKey="avg" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "#4B5563", formatter: (v: unknown) => `${Number(v).toFixed(1)}점` }}>
            {data.map((entry, idx) => (
              <Cell key={entry.subject} fill={subjectColor(idx)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function DistributionClient({
  periods,
  initialSessions,
  initialPeriodId,
  initialSessionId,
  initialExamType,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [periodId, setPeriodId] = useState<number | null>(initialPeriodId);
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId);
  const [examType, setExamType] = useState<string>(initialExamType ?? "");
  const [sessions, setSessions] = useState<SessionOption[]>(initialSessions);
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch sessions when period or examType changes
  const fetchSessions = useCallback(
    async (pid: number | null, et: string) => {
      if (pid === null) { setSessions([]); return; }
      const params = new URLSearchParams({ periodId: String(pid) });
      if (et) params.set("examType", et);
      // Re-use distribution API to get sessions list
      const res = await fetch(`/api/results/distribution?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json() as { data: ApiData };
      setSessions(json.data.sessions ?? []);
    },
    [],
  );

  // Fetch distribution data
  const fetchData = useCallback(async (pid: number | null, sid: number | null, et: string) => {
    if (pid === null) { setData(null); return; }
    setLoading(true);
    const params = new URLSearchParams({ periodId: String(pid) });
    if (sid !== null) params.set("sessionId", String(sid));
    if (et) params.set("examType", et);
    try {
      const res = await fetch(`/api/results/distribution?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json() as { data: ApiData };
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount if initial values provided, fetch data
  useEffect(() => {
    if (initialPeriodId !== null) {
      void fetchData(initialPeriodId, initialSessionId, initialExamType ?? "");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Update URL
    const params = new URLSearchParams();
    if (periodId !== null) params.set("periodId", String(periodId));
    if (sessionId !== null) params.set("sessionId", String(sessionId));
    if (examType) params.set("examType", examType);
    startTransition(() => {
      router.push(`/admin/results/distribution?${params.toString()}`);
    });
    void fetchData(periodId, sessionId, examType);
  };

  const handlePeriodChange = (val: string) => {
    const pid = val ? parseInt(val) : null;
    setPeriodId(pid);
    setSessionId(null);
    void fetchSessions(pid, examType);
  };

  const handleExamTypeChange = (val: string) => {
    setExamType(val);
    setSessionId(null);
    void fetchSessions(periodId, val);
  };

  // Total count from distribution
  const totalCount = data?.distribution.reduce((s, d) => s + d.count, 0) ?? 0;

  return (
    <div className="mt-8 space-y-6">
      {/* Filter form */}
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 sm:grid-cols-4"
      >
        {/* Period */}
        <div>
          <label className="mb-2 block text-sm font-medium">기간 선택</label>
          <select
            value={periodId ?? ""}
            onChange={(e) => handlePeriodChange(e.target.value)}
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

        {/* Exam type */}
        <div>
          <label className="mb-2 block text-sm font-medium">수험 유형</label>
          <select
            value={examType}
            onChange={(e) => handleExamTypeChange(e.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체</option>
            {(["GONGCHAE", "GYEONGCHAE"] as ExamType[]).map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Session */}
        <div>
          <label className="mb-2 block text-sm font-medium">회차 선택</label>
          <select
            value={sessionId ?? ""}
            onChange={(e) => setSessionId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 회차 합산</option>
            {sessions.map((s) => {
              const dateStr = new Date(s.examDate).toLocaleDateString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
              });
              const subjectLabel = (SUBJECT_LABEL as Record<string, string>)[s.subject] ?? s.subject;
              return (
                <option key={s.id} value={s.id}>
                  {s.week}주차 {dateStr} {subjectLabel}
                </option>
              );
            })}
          </select>
        </div>

        {/* Submit */}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={periodId === null || isPending || loading}
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
          >
            {loading || isPending ? "조회 중..." : "조회"}
          </button>
        </div>
      </form>

      {/* Results */}
      {data === null ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          기간을 선택하고 조회 버튼을 누르세요.
        </div>
      ) : data.stats === null || totalCount === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          선택한 조건에 해당하는 성적 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          <KpiCards stats={data.stats} count={totalCount} />

          <div className="grid gap-6 lg:grid-cols-2">
            <DistributionBarChart data={data.distribution} />
            <SubjectAveragesChart data={data.subjectAverages} />
          </div>
        </div>
      )}
    </div>
  );
}
