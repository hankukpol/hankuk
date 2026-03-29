import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function parseDateParam(raw: string | string[] | undefined): string | undefined {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function readParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const v = sp?.[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MonthBucket = {
  year: number;
  month: number;
  key: string;
  label: string;
  counselingCount: number;
  convertedCount: number;
  conversionRate: string;
};

type CounselorStat = {
  name: string;
  totalCount: number;
  convertedCount: number;
  conversionRate: string;
  conversionRateNum: number;
};

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({
  data,
  color,
  label,
}: {
  data: number[];
  color: string;
  label: string;
}) {
  const W = 480;
  const H = 80;
  const PAD = 8;
  const max = Math.max(...data, 1);

  const points = data.map((v, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - 2 * PAD);
    const y = PAD + (1 - v / max) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = points.join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      aria-label={label}
      role="img"
    >
      {/* Grid lines */}
      {[0, 0.5, 1].map((t) => {
        const y = PAD + (1 - t) * (H - 2 * PAD);
        return (
          <line
            key={t}
            x1={PAD}
            y1={y.toFixed(1)}
            x2={W - PAD}
            y2={y.toFixed(1)}
            stroke="#E5E7EB"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Area fill */}
      <polyline
        points={`${PAD},${H - PAD} ${polyline} ${(PAD + ((data.length - 1) / Math.max(data.length - 1, 1)) * (W - 2 * PAD)).toFixed(1)},${H - PAD}`}
        fill={color}
        fillOpacity="0.12"
        stroke="none"
      />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots */}
      {data.map((v, i) => {
        const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - 2 * PAD);
        const y = PAD + (1 - v / max) * (H - 2 * PAD);
        return (
          <circle
            key={i}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r="3"
            fill="white"
            stroke={color}
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

// ─── Medal badge ──────────────────────────────────────────────────────────────

function Medal({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-white">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-400 text-xs font-bold text-white">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-700 text-xs font-bold text-white">
        3
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-slate">
      {rank}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ConsultationStatsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const dateFrom = parseDateParam(sp.from);
  const dateTo = parseDateParam(sp.to);

  const prisma = getPrisma();
  const now = new Date();

  // 6-month window
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const filterFrom = dateFrom ? new Date(dateFrom) : sixMonthsAgo;
  const filterTo = dateTo ? new Date(dateTo + "T23:59:59.999Z") : now;

  // ─── Load counseling records ────────────────────────────────────────────────
  const counselingRecords = await prisma.counselingRecord.findMany({
    where: {
      counseledAt: {
        gte: filterFrom,
        lte: filterTo,
      },
    },
    select: {
      id: true,
      examNumber: true,
      counselorName: true,
      content: true,
      recommendation: true,
      counseledAt: true,
    },
    orderBy: { counseledAt: "asc" },
  });

  // ─── Load enrollments within the window (+30 days grace) ───────────────────
  const enrollmentWindowEnd = new Date(filterTo);
  enrollmentWindowEnd.setDate(enrollmentWindowEnd.getDate() + 30);

  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
      createdAt: {
        gte: filterFrom,
        lte: enrollmentWindowEnd,
      },
    },
    select: {
      id: true,
      examNumber: true,
      createdAt: true,
    },
  });

  // Index: examNumber -> earliest enrollment date within window
  const enrollmentMap = new Map<string, Date>();
  for (const e of enrollments) {
    const existing = enrollmentMap.get(e.examNumber);
    const d = new Date(e.createdAt);
    if (!existing || d < existing) {
      enrollmentMap.set(e.examNumber, d);
    }
  }

  // ─── Build 6-month buckets ──────────────────────────────────────────────────
  const months: Array<{ year: number; month: number; key: string; label: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key: monthKey(d.getFullYear(), d.getMonth() + 1),
      label: monthLabel(d.getFullYear(), d.getMonth() + 1),
    });
  }

  // Helper: was this student converted (enrolled within 30 days of counseling)?
  function isConverted(examNumber: string, counseledAt: Date): boolean {
    const enrollDate = enrollmentMap.get(examNumber);
    if (!enrollDate) return false;
    const diff = enrollDate.getTime() - counseledAt.getTime();
    return diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
  }

  // ─── Monthly trend data ─────────────────────────────────────────────────────
  const monthBuckets: MonthBucket[] = months.map((m) => {
    const mStart = new Date(m.year, m.month - 1, 1);
    const mEnd = new Date(m.year, m.month, 0, 23, 59, 59, 999);

    const monthRecords = counselingRecords.filter((r) => {
      const d = new Date(r.counseledAt);
      return d >= mStart && d <= mEnd;
    });

    // unique students counseled this month
    const uniqueStudents = new Map<string, Date>();
    for (const r of monthRecords) {
      const d = new Date(r.counseledAt);
      if (!uniqueStudents.has(r.examNumber) || d < uniqueStudents.get(r.examNumber)!) {
        uniqueStudents.set(r.examNumber, d);
      }
    }

    let converted = 0;
    for (const [examNumber, counselDate] of uniqueStudents.entries()) {
      if (isConverted(examNumber, counselDate)) converted++;
    }

    const total = uniqueStudents.size;
    return {
      year: m.year,
      month: m.month,
      key: m.key,
      label: m.label,
      counselingCount: monthRecords.length,
      convertedCount: converted,
      conversionRate: pct(converted, total),
    };
  });

  // ─── Per-counselor stats ────────────────────────────────────────────────────
  const counselorMap = new Map<
    string,
    { total: number; convertedStudents: Set<string>; studentFirstCounsel: Map<string, Date> }
  >();

  for (const r of counselingRecords) {
    const name = r.counselorName;
    if (!counselorMap.has(name)) {
      counselorMap.set(name, {
        total: 0,
        convertedStudents: new Set(),
        studentFirstCounsel: new Map(),
      });
    }
    const entry = counselorMap.get(name)!;
    entry.total++;
    const d = new Date(r.counseledAt);
    const existing = entry.studentFirstCounsel.get(r.examNumber);
    if (!existing || d < existing) {
      entry.studentFirstCounsel.set(r.examNumber, d);
    }
  }

  // Compute conversions per counselor
  for (const entry of counselorMap.values()) {
    for (const [examNumber, counselDate] of entry.studentFirstCounsel.entries()) {
      if (isConverted(examNumber, counselDate)) {
        entry.convertedStudents.add(examNumber);
      }
    }
  }

  const counselorStats: CounselorStat[] = Array.from(counselorMap.entries())
    .map(([name, data]) => {
      const total = data.total;
      const uniqueStudents = data.studentFirstCounsel.size;
      const converted = data.convertedStudents.size;
      const rateNum = uniqueStudents > 0 ? (converted / uniqueStudents) * 100 : 0;
      return {
        name,
        totalCount: total,
        convertedCount: converted,
        conversionRate: pct(converted, uniqueStudents),
        conversionRateNum: rateNum,
      };
    })
    .sort((a, b) => b.conversionRateNum - a.conversionRateNum);

  // Top 3 counselors for medal highlighting
  const top3Names = new Set(counselorStats.slice(0, 3).map((c) => c.name));

  // ─── Overall KPIs ───────────────────────────────────────────────────────────
  const totalCounselings = counselingRecords.length;
  const uniqueCounseledStudents = new Set(counselingRecords.map((r) => r.examNumber));
  let totalConverted = 0;
  for (const examNumber of uniqueCounseledStudents) {
    // Find earliest counseling date for this student
    const dates = counselingRecords
      .filter((r) => r.examNumber === examNumber)
      .map((r) => new Date(r.counseledAt));
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    if (isConverted(examNumber, earliest)) totalConverted++;
  }
  const overallConversionRate = pct(totalConverted, uniqueCounseledStudents.size);

  // Type inference from content keywords
  const typeKeywords: Array<{ type: string; keywords: string[]; count: number }> = [
    { type: "수강료 문의", keywords: ["수강료", "비용", "가격", "할인"], count: 0 },
    { type: "강좌 안내", keywords: ["강좌", "커리큘럼", "강의", "수업"], count: 0 },
    { type: "시험 정보", keywords: ["시험", "필기", "최종", "합격", "경쟁률"], count: 0 },
    { type: "재방문 상담", keywords: ["재방문", "다시", "재상담"], count: 0 },
    { type: "전화 상담", keywords: ["전화", "통화"], count: 0 },
    { type: "기타", keywords: [], count: 0 },
  ];

  for (const r of counselingRecords) {
    const combined = (r.content + " " + (r.recommendation ?? "")).toLowerCase();
    let matched = false;
    for (const t of typeKeywords) {
      if (t.type === "기타") continue;
      if (t.keywords.some((kw) => combined.includes(kw))) {
        t.count++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      typeKeywords[typeKeywords.length - 1].count++;
    }
  }

  // ─── Funnel stages ──────────────────────────────────────────────────────────
  // 상담 → 재방문(has content with revisit keywords) → 등록
  const revisitKeywords = ["재방문", "다시", "재상담", "추가 상담", "다음 방문"];
  const revisitStudents = new Set(
    counselingRecords
      .filter((r) =>
        revisitKeywords.some((kw) => r.content.includes(kw) || (r.recommendation ?? "").includes(kw)),
      )
      .map((r) => r.examNumber),
  );

  const funnelStages = [
    { label: "상담", count: uniqueCounseledStudents.size },
    { label: "재방문", count: revisitStudents.size },
    { label: "등록", count: totalConverted },
  ];

  const funnelMax = funnelStages[0].count || 1;

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const chartCounselingData = monthBuckets.map((m) => m.counselingCount);
  const chartConvertedData = monthBuckets.map((m) => m.convertedCount);

  // ─── CSV export URL ─────────────────────────────────────────────────────────
  const csvParams = new URLSearchParams();
  if (dateFrom) csvParams.set("from", dateFrom);
  if (dateTo) csvParams.set("to", dateTo);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <Link href="/admin/consultations" className="transition hover:text-ink">
          상담 관리
        </Link>
        <span>/</span>
        <span className="text-ink">전환 통계</span>
      </nav>

      {/* Header badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        상담 분석
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">상담 전환 통계</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            최근 6개월 상담 기록의 수강 등록 전환율, 담당자별 성과, 퍼널 분석을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/consultations"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            ← 상담 목록
          </Link>
          <Link
            href={`/api/consultations/stats/export${csvParams.toString() ? "?" + csvParams.toString() : ""}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            CSV 내보내기
          </Link>
        </div>
      </div>

      {/* Date range filter */}
      <form
        method="GET"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">시작일</label>
          <input
            type="date"
            name="from"
            defaultValue={dateFrom ?? ""}
            className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-forest/40 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">종료일</label>
          <input
            type="date"
            name="to"
            defaultValue={dateTo ?? ""}
            className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-forest/40 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest"
        >
          적용
        </button>
        <Link
          href="/admin/consultations/stats"
          className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          초기화
        </Link>
      </form>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">전체 상담 건수</p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {totalCounselings.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">기간 내 총 기록</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">고유 상담 학생</p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {uniqueCounseledStudents.size.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명 (중복 제거)</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">수강 전환 인원</p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {totalConverted.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">상담 후 30일 이내 등록</p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">전체 전환율</p>
          <p className="mt-2 text-3xl font-semibold text-ember">{overallConversionRate}</p>
          <p className="mt-1 text-xs text-slate">
            {totalConverted} / {uniqueCounseledStudents.size}명
          </p>
        </div>
      </div>

      {/* Monthly trend chart */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">월별 상담 건수 추이</h2>
            <p className="mt-1 text-xs text-slate">최근 6개월 상담 건수 및 전환 건수 변화</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest" />
              상담 건수
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-ember" />
              전환 건수
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-forest">상담 건수</p>
          <LineChart data={chartCounselingData} color="#1F4D3A" label="월별 상담 건수 차트" />
          <p className="mb-1 mt-4 text-xs font-medium text-ember">전환 건수</p>
          <LineChart data={chartConvertedData} color="#C55A11" label="월별 전환 건수 차트" />
        </div>

        {/* Month labels */}
        <div className="mt-2 flex justify-between px-2 text-xs text-slate">
          {monthBuckets.map((m) => (
            <span key={m.key}>{m.label.replace("년 ", "/").replace("월", "")}</span>
          ))}
        </div>

        {/* Monthly table */}
        <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  월
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  상담 건수
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  전환 인원
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  전환율
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthBuckets.map((m) => (
                <tr key={m.key} className="transition-colors hover:bg-mist/60">
                  <td className="px-4 py-3 font-medium text-ink">{m.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate">
                    {m.counselingCount.toLocaleString()}건
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-forest">
                    {m.convertedCount.toLocaleString()}명
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-ember">
                    {m.conversionRate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Funnel stages */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">전환 퍼널</h2>
        <p className="mt-1 text-xs text-slate">
          상담 → 재방문 → 등록 단계별 학생 수 (키워드 기반 추정)
        </p>

        <div className="mt-6 space-y-4">
          {funnelStages.map((stage, idx) => {
            const widthPct = funnelMax > 0 ? (stage.count / funnelMax) * 100 : 0;
            const funnelColors = ["bg-forest", "bg-amber-500", "bg-ember"];
            return (
              <div key={stage.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">
                    {idx + 1}. {stage.label}
                  </span>
                  <span className="font-semibold text-ink">
                    {stage.count.toLocaleString()}명
                    {idx > 0 && (
                      <span className="ml-2 text-xs font-normal text-slate">
                        ({pct(stage.count, funnelStages[0].count)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-7 overflow-hidden rounded-full bg-mist">
                  <div
                    className={`h-full rounded-full ${funnelColors[idx]} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                {idx < funnelStages.length - 1 && (
                  <p className="text-right text-xs text-slate">
                    다음 단계 전환율:{" "}
                    <strong className="text-ink">
                      {pct(funnelStages[idx + 1].count, stage.count)}
                    </strong>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Topic / Type breakdown */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">상담 주제별 분류</h2>
        <p className="mt-1 text-xs text-slate">상담 내용 키워드 기반 자동 분류</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {typeKeywords.map((t) => {
            const tPct = totalCounselings > 0 ? (t.count / totalCounselings) * 100 : 0;
            return (
              <div
                key={t.type}
                className="flex items-center justify-between rounded-[20px] border border-ink/10 p-4"
              >
                <div>
                  <p className="text-xs font-medium text-slate">{t.type}</p>
                  <p className="mt-1 text-2xl font-bold text-ink">
                    {t.count.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ember">{tPct.toFixed(1)}%</p>
                  <div className="mt-1 h-8 w-1 rounded-full bg-mist">
                    <div
                      className="rounded-full bg-ember"
                      style={{ height: `${tPct}%`, marginTop: `${100 - tPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Per-staff conversion table */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">담당자별 전환 성과</h2>
        <p className="mt-1 text-xs text-slate">
          기간 내 상담 기록 기준, 상담 후 30일 이내 수강 등록 전환율
        </p>

        {counselorStats.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            상담 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    순위
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    상담건수
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    전환건수
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    전환율
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    성과 바
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {counselorStats.map((row, idx) => (
                  <tr
                    key={row.name}
                    className={`transition-colors hover:bg-mist/60 ${
                      top3Names.has(row.name) ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <td className="px-5 py-3">
                      <Medal rank={idx + 1} />
                    </td>
                    <td className="px-5 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate">
                      {row.totalCount.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-forest">
                      {row.convertedCount.toLocaleString()}명
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-ember">
                      {row.conversionRate}
                    </td>
                    <td className="px-5 py-3">
                      <div className="ml-auto h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-ember"
                          style={{ width: `${Math.min(100, row.conversionRateNum)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top 3 callout */}
        {counselorStats.length >= 3 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {counselorStats.slice(0, 3).map((row, idx) => (
              <div
                key={row.name}
                className="flex items-center gap-2 rounded-[20px] border border-amber-100 bg-amber-50 px-4 py-2.5"
              >
                <Medal rank={idx + 1} />
                <div>
                  <p className="text-xs font-semibold text-ink">{row.name}</p>
                  <p className="text-xs text-amber-700">전환율 {row.conversionRate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/consultations"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          상담 목록 →
        </Link>
        <Link
          href="/admin/analytics/counseling-conversion"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          전환 분석 →
        </Link>
        <Link
          href="/admin/analytics/counseling"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          면담 현황 →
        </Link>
      </div>
    </div>
  );
}
