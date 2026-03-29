import { AdminRole } from "@prisma/client";
import { ScoreSourceStatsPanel } from "@/components/audit-log/score-source-stats-panel";
import { listAuditLogs } from "@/lib/audit-log/service";
import { requireAdminContext } from "@/lib/auth";
import { formatDateTime, todayDateInputValue } from "@/lib/format";
import { listPeriodsBasic } from "@/lib/periods/service";
import { getScoreSourceStats } from "@/lib/scores/stats";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function stringifyAuditValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  return JSON.stringify(value, null, 2);
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  const admin = readParam(searchParams, "admin") ?? "";
  const action = readParam(searchParams, "action") ?? "";
  const date = readParam(searchParams, "date") ?? todayDateInputValue();
  const examNumber = readParam(searchParams, "examNumber") ?? "";

  const [, rows, periods] = await Promise.all([
    requireAdminContext(AdminRole.SUPER_ADMIN),
    listAuditLogs({ admin, action, date, examNumber }),
    listPeriodsBasic(),
  ]);

  const initialPeriodId = periods.find((period) => period.isActive)?.id ?? periods[0]?.id ?? null;
  const initialStats = initialPeriodId ? await getScoreSourceStats(initialPeriodId) : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        D-12 Score Source Stats
      </div>
      <h1 className="mt-5 text-3xl font-semibold">Audit Log</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Review admin actions together with before and after payloads. This screen is read-only.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium">Admin</label>
          <input
            type="text"
            name="admin"
            defaultValue={admin}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="Name or email"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Action</label>
          <input
            type="text"
            name="action"
            defaultValue={action}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="Example: SCORE_UPDATE"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Date</label>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Exam number</label>
          <input
            type="text"
            name="examNumber"
            defaultValue={examNumber}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="Search targetId or examNumber in JSON payload"
          />
        </div>
        <div className="flex justify-end md:col-span-4">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            Search
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Results</h2>
          <p className="text-sm text-slate">{`${rows.length} rows`}</p>
        </div>

        <div className="mt-6 space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              No audit logs matched the current filters.
            </div>
          ) : null}
          {rows.map((row) => (
            <article key={row.id} className="rounded-[28px] border border-ink/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{row.action}</h3>
                    <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
                      {`${row.targetType} / ${row.targetId}`}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate">
                    {`${row.admin.name} (${row.admin.email}) / ${formatDateTime(row.createdAt)}`}
                  </p>
                  <p className="mt-1 text-xs text-slate">{`IP: ${row.ipAddress ?? "-"}`}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <details className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <summary className="cursor-pointer text-sm font-semibold">Before</summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate">
                    {stringifyAuditValue(row.before)}
                  </pre>
                </details>
                <details className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <summary className="cursor-pointer text-sm font-semibold">After</summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate">
                    {stringifyAuditValue(row.after)}
                  </pre>
                </details>
              </div>
            </article>
          ))}
        </div>
      </section>

      <ScoreSourceStatsPanel
        periods={periods.map((period) => ({
          id: period.id,
          name: period.name,
          isActive: period.isActive,
        }))}
        initialPeriodId={initialPeriodId}
        initialStats={initialStats}
      />
    </div>
  );
}
