import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamEventType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  getStudentIntegratedScoreHistory,
  STUDENT_SCORE_EXAM_TYPE_LABEL,
  type StudentIntegratedScoreRow,
} from "@/lib/students/integrated-score-history";

export const dynamic = "force-dynamic";

const TYPE_BADGE_CLASS: Record<ExamEventType, string> = {
  MORNING: "border-forest/20 bg-forest/10 text-forest",
  MONTHLY: "border-ember/20 bg-ember/10 text-ember",
  SPECIAL: "border-sky-200 bg-sky-50 text-sky-700",
  EXTERNAL: "border-violet-200 bg-violet-50 text-violet-700",
};

type PageProps = {
  params: Promise<{ examNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${year}\uB144 ${Number(month)}\uC6D4`;
}

function buildFilterHref(
  examNumber: string,
  examType: ExamEventType | null,
  subject: Subject | null,
) {
  const query = new URLSearchParams();
  if (examType) {
    query.set("type", examType);
  }
  if (subject) {
    query.set("subject", subject);
  }

  const baseHref = `/admin/students/${examNumber}/score-trend`;
  const search = query.toString();
  return search ? `${baseHref}?${search}` : baseHref;
}

function buildRankText(row: StudentIntegratedScoreRow) {
  if (row.rank === null || row.participantCount === null) {
    return "\u2014";
  }

  return `${row.rank}\uC704 / ${row.participantCount}`;
}

export default async function StudentScoreTrendPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { examNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const history = await getStudentIntegratedScoreHistory(examNumber);

  if (!history) {
    notFound();
  }

  const availableTypes = Array.from(new Set(history.rows.map((row) => row.examType))) as ExamEventType[];
  const rawType = pickFirst(resolvedSearchParams.type);
  const selectedType =
    rawType && availableTypes.includes(rawType as ExamEventType)
      ? (rawType as ExamEventType)
      : null;

  const allowSubjectFilter = selectedType === null || selectedType === ExamEventType.MORNING;
  const rawSubject = pickFirst(resolvedSearchParams.subject);
  const selectedSubject =
    allowSubjectFilter &&
    rawSubject &&
    history.subjectOptions.some((option) => option.value === rawSubject)
      ? (rawSubject as Subject)
      : null;

  const filteredRows = history.rows
    .filter((row) => row.score !== null)
    .filter((row) => (selectedType ? row.examType === selectedType : true))
    .filter((row) => (selectedSubject ? row.subject === selectedSubject : true))
    .sort((left, right) => left.examDate.getTime() - right.examDate.getTime());

  const averageScore =
    filteredRows.length > 0
      ? Math.round(
          (filteredRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / filteredRows.length) * 10,
        ) / 10
      : null;
  const recentRows = filteredRows.slice(-5);
  const recentAverage =
    recentRows.length > 0
      ? Math.round(
          (recentRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / recentRows.length) * 10,
        ) / 10
      : null;
  const trendDelta =
    averageScore !== null && recentAverage !== null
      ? Math.round((recentAverage - averageScore) * 10) / 10
      : null;
  const bestRow = filteredRows.reduce<StudentIntegratedScoreRow | null>(
    (best, row) =>
      best === null || (row.score ?? -1) > (best.score ?? -1) ? row : best,
    null,
  );

  const monthlyAccumulator = new Map<string, { sum: number; count: number }>();
  for (const row of filteredRows) {
    const key = `${row.examDate.getFullYear()}-${String(row.examDate.getMonth() + 1).padStart(2, "0")}`;
    const current = monthlyAccumulator.get(key) ?? { sum: 0, count: 0 };
    current.sum += row.score ?? 0;
    current.count += 1;
    monthlyAccumulator.set(key, current);
  }
  const monthlyAverages = Array.from(monthlyAccumulator.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      average: Math.round((value.sum / value.count) * 10) / 10,
    }));

  const chartRows = filteredRows.slice(-24);
  const chartWidth = 640;
  const chartHeight = 180;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 28;
  const innerWidth = chartWidth - padLeft - padRight;
  const innerHeight = chartHeight - padTop - padBottom;
  const xScale = (index: number) =>
    chartRows.length <= 1
      ? padLeft + innerWidth / 2
      : padLeft + (index / (chartRows.length - 1)) * innerWidth;
  const yScale = (value: number) => padTop + innerHeight - (value / 100) * innerHeight;
  const linePoints = chartRows
    .map((row, index) => `${xScale(index).toFixed(1)},${yScale(row.score ?? 0).toFixed(1)}`)
    .join(" ");

  const maxScore = Math.max(...filteredRows.map((row) => row.score ?? 0), 100);

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            {"\u2190"} {history.student.name} ({examNumber})
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">
            {history.student.name}
            <span className="ml-3 text-xl font-normal text-slate">{examNumber}</span>
          </h1>
          <p className="mt-2 text-sm text-slate">
            {EXAM_TYPE_LABEL[history.student.examType]}
            {history.student.className ? ` \u00B7 ${history.student.className}\uBC18` : ""}
            {history.student.generation ? ` \u00B7 ${history.student.generation}\uAE30` : ""}
            {history.student.mobile ? ` \u00B7 ${history.student.mobile}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${examNumber}/scores${selectedType ? `?type=${selectedType}` : ""}`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
          >
            {"\uC804\uCCB4 \uC131\uC801 \uC774\uB825"}
          </Link>
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center rounded-full border border-ember/20 px-4 py-2 text-xs font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/5"
          >
            {"\uD559\uC0DD \uC0C1\uC138"}
          </Link>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Link
          href={buildFilterHref(examNumber, null, null)}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
            selectedType === null
              ? "border-ink/20 bg-ink text-white"
              : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"
          }`}
        >
          {"\uC804\uCCB4 \uC2DC\uD5D8"}
        </Link>
        {availableTypes.map((type) => (
          <Link
            key={type}
            href={buildFilterHref(examNumber, type, null)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
              selectedType === type
                ? "border-ink/20 bg-ink text-white"
                : TYPE_BADGE_CLASS[type]
            }`}
          >
            {STUDENT_SCORE_EXAM_TYPE_LABEL[type]}
          </Link>
        ))}
      </div>

      {allowSubjectFilter && history.subjectOptions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={buildFilterHref(examNumber, selectedType, null)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
              selectedSubject === null
                ? "border-ember/30 bg-ember/10 text-ember"
                : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
            }`}
          >
            {"\uC804\uCCB4 \uACFC\uBAA9"}
          </Link>
          {history.subjectOptions.map((option) => (
            <Link
              key={option.value}
              href={buildFilterHref(examNumber, selectedType, option.value)}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                selectedSubject === option.value
                  ? "border-ember/30 bg-ember/10 text-ember"
                  : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{"\uC804\uCCB4 \uD3C9\uADE0"}</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{averageScore !== null ? `${averageScore}\uC810` : "\u2014"}</p>
          <p className="mt-1 text-xs text-slate">{"\uD544\uD130 \uC801\uC6A9 \uAE30\uC900"}</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{"\uCD5C\uADFC 5\uAC74 \uD3C9\uADE0"}</p>
          <p className="mt-3 text-3xl font-semibold text-forest">{recentAverage !== null ? `${recentAverage}\uC810` : "\u2014"}</p>
          <p className="mt-1 text-xs text-slate">
            {trendDelta !== null
              ? `\uC804\uCCB4 \uB300\uBE44 ${trendDelta > 0 ? "+" : ""}${trendDelta}\uC810`
              : "\uCD5C\uADFC \uAE30\uB85D \uC5C6\uC74C"}
          </p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{"\uAE30\uB85D \uAC74\uC218"}</p>
          <p className="mt-3 text-3xl font-semibold text-ember">{filteredRows.length}</p>
          <p className="mt-1 text-xs text-slate">{"\uC810\uC218 \uB4F1\uB85D \uC2DC\uD5D8"}</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{"\uCD5C\uACE0 \uC810\uC218"}</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{bestRow?.score !== null && bestRow?.score !== undefined ? `${bestRow.score}\uC810` : "\u2014"}</p>
          <p className="mt-1 text-xs text-slate">{bestRow ? `${formatDate(bestRow.examDate)} \u00B7 ${bestRow.title}` : "\uAE30\uB85D \uC5C6\uC74C"}</p>
        </article>
      </section>

      {filteredRows.length === 0 ? (
        <section className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-16 text-center text-sm text-slate">
          {"\uC120\uD0DD\uD55C \uC870\uAC74\uC5D0 \uD574\uB2F9\uD558\uB294 \uC131\uC801 \uCD94\uC774 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
        </section>
      ) : (
        <>
          {chartRows.length >= 2 && (
            <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">{"\uCD5C\uADFC \uC131\uC801 \uCD94\uC774"}</h2>
                  <p className="mt-1 text-xs text-slate">{`\uCD5C\uADFC ${chartRows.length}\uAC74 \uAE30\uC900\uC785\uB2C8\uB2E4.`}</p>
                </div>
                {selectedType && (
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${TYPE_BADGE_CLASS[selectedType]}`}>
                    {STUDENT_SCORE_EXAM_TYPE_LABEL[selectedType]}
                  </span>
                )}
              </div>
              <div className="mt-6 overflow-x-auto">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[640px]">
                  {[0, 20, 40, 60, 80, 100].map((tick) => {
                    const y = yScale(tick);
                    return (
                      <g key={tick}>
                        <line x1={padLeft} x2={chartWidth - padRight} y1={y} y2={y} stroke="#E5E7EB" strokeDasharray="4 4" />
                        <text x={4} y={y + 4} fontSize={10} fill="#6B7280">{tick}</text>
                      </g>
                    );
                  })}
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke="#C55A11"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {chartRows.map((row, index) => {
                    const x = xScale(index);
                    const y = yScale(row.score ?? 0);
                    return (
                      <g key={row.id}>
                        <circle cx={x} cy={y} r={4} fill="#1F4D3A" stroke="white" strokeWidth={1.5} />
                        <text x={x} y={chartHeight - 6} textAnchor="middle" fontSize={9} fill="#6B7280">
                          {`${String(row.examDate.getMonth() + 1).padStart(2, "0")}/${String(row.examDate.getDate()).padStart(2, "0")}`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </section>
          )}

          <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">{"\uD68C\uCC28\uBCC4 \uCD94\uC774"}</h2>
              <span className="text-xs text-slate">{`\uCD1D ${filteredRows.length}\uAC74`}</span>
            </div>
            <div className="mt-6 space-y-3">
              {filteredRows.map((row) => {
                const width = Math.max(
                  Math.round(((row.score ?? 0) / maxScore) * 100),
                  row.score !== null ? 2 : 0,
                );

                return (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-[20px] border border-ink/5 bg-mist/40 p-4 lg:grid-cols-[148px_1fr_96px_96px] lg:items-center"
                  >
                    <div>
                      <p className="text-xs font-mono text-slate">{formatDate(row.examDate)}</p>
                      <p className="mt-1 text-sm font-medium text-ink">{row.title}</p>
                      <p className="mt-1 text-[11px] text-slate">{`${row.examTypeLabel} \u00B7 ${row.subjectLabel}`}</p>
                    </div>
                    <div>
                      <div className="overflow-hidden rounded-full bg-ink/10">
                        <div className="h-6 rounded-full bg-ember/70" style={{ width: `${width}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate">{row.metricLabel ?? "\uAE30\uC900 \uC5C6\uC74C"}</p>
                    </div>
                    <div className="text-right lg:text-left">
                      <p className="text-xs text-slate">{"\uC810\uC218"}</p>
                      <p className="text-lg font-semibold text-ink">{`${row.score}\uC810`}</p>
                    </div>
                    <div className="text-right lg:text-left">
                      <p className="text-xs text-slate">{"\uC11D\uCC28"}</p>
                      <p className="text-sm font-semibold text-ink">{buildRankText(row)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {monthlyAverages.length > 0 && (
            <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <h2 className="text-base font-semibold text-ink">{"\uC6D4\uBCC4 \uD3C9\uADE0"}</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {monthlyAverages.map((item) => (
                  <div key={item.key} className="rounded-[20px] border border-ink/5 bg-mist p-4">
                    <p className="text-xs text-slate">{formatMonthLabel(item.key)}</p>
                    <p className="mt-2 text-2xl font-semibold text-forest">{`${item.average}\uC810`}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist text-left text-xs text-slate">
                    <th className="px-6 py-3 font-semibold">{"\uC2DC\uD5D8\uC77C"}</th>
                    <th className="px-4 py-3 font-semibold">{"\uC2DC\uD5D8\uBA85"}</th>
                    <th className="px-4 py-3 font-semibold">{"\uC720\uD615"}</th>
                    <th className="px-4 py-3 font-semibold">{"\uACFC\uBAA9"}</th>
                    <th className="px-4 py-3 text-right font-semibold">{"\uC810\uC218"}</th>
                    <th className="px-4 py-3 text-right font-semibold">{"\uC11D\uCC28"}</th>
                    <th className="px-4 py-3 font-semibold">{"\uCD9C\uACB0/\uAD6C\uBD84"}</th>
                    <th className="px-4 py-3 font-semibold">{"\uBA54\uBAA8"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-mist/40">
                      <td className="px-6 py-3 font-mono text-xs text-ink">{formatDate(row.examDate)}</td>
                      <td className="px-4 py-3 text-ink">{row.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TYPE_BADGE_CLASS[row.examType]}`}>
                          {row.examTypeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink">{row.subjectLabel}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">{`${row.score}\uC810`}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate">{buildRankText(row)}</td>
                      <td className="px-4 py-3 text-xs text-slate">{row.metricLabel ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-xs text-slate">{row.note ?? "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}