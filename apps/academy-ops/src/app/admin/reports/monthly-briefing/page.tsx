import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

type AtRiskStudent = {
  examNumber: string;
  name: string;
  mobile: string | null;
  absCount: number;
  avgScore: number | null;
  attendanceRate: number | null;
  riskReasons: string[];
};

type TopStudent = {
  examNumber: string;
  name: string;
  mobile: string | null;
  avgScore: number;
  attendanceRate: number;
};

type Summary = {
  newEnrollments: number;
  withdrawals: number;
  netChange: number;
  totalActive: number;
};

type CohortStat = {
  id: string;
  name: string;
  examCategory: string;
  activeStudents: number;
  avgScore: number | null;
  attendanceRate: number | null;
};

type BriefingData = {
  month: string;
  atRiskStudents: AtRiskStudent[];
  topStudents: TopStudent[];
  summary: Summary;
  cohortStats: CohortStat[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return param;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function korMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return `${y}년 ${m}월`;
}

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  sub,
  highlight,
  warn,
}: {
  title: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">{title}</p>
      <p
        className={`mt-3 text-2xl font-bold ${
          warn ? "text-red-600" : highlight ? "text-ember" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MonthlyBriefingPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const monthStr = parseMonthParam(searchParams.month);
  const korMonth = korMonthLabel(monthStr);
  const printDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isCurrentMonth = (() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return monthStr === cur;
  })();

  const isFutureMonth = new Date(monthStr + "-01") > new Date();

  // Fetch data from API
  let data: BriefingData | null = null;
  let fetchError: string | null = null;

  try {
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/reports/monthly-briefing?month=${monthStr}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as { data: BriefingData };
      data = json.data;
    } else {
      fetchError = "데이터를 불러올 수 없습니다.";
    }
  } catch {
    fetchError = "네트워크 오류가 발생했습니다.";
  }

  const atRisk = data?.atRiskStudents ?? [];
  const top = data?.topStudents ?? [];
  const summary = data?.summary ?? { newEnrollments: 0, withdrawals: 0, netChange: 0, totalActive: 0 };
  const cohortStats = data?.cohortStats ?? [];

  return (
    <div className="space-y-8 p-8 sm:p-10 print:space-y-6 print:p-6">
      {/* ── 인쇄용 헤더 ── */}
      <div className="hidden print:block print:border-b print:border-ink/20 print:pb-4 print:mb-6">
        <p className="text-xs text-slate">학원명 미설정 | 학원 주소는 관리자 설정을 확인하세요</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{korMonth} 월간 브리핑</h1>
        <p className="mt-1 text-xs text-slate">출력일: {printDate}</p>
      </div>

      {/* ── 화면용 헤더 ── */}
      <div className="print:hidden">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
          월간 브리핑
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">{korMonth} 학생 현황 브리핑</h1>
        <p className="mt-2 text-sm text-slate">
          위험 학생, 우수 학생, 수강 현황 및 반별 통계를 한눈에 확인합니다.
        </p>
      </div>

      {/* ── 월 네비게이션 ── */}
      <div className="print:hidden flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/reports/monthly-briefing?month=${prevMonth(monthStr)}`}
          className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          ← 이전 달
        </Link>
        <span className="rounded-xl bg-forest/10 px-4 py-2 text-sm font-semibold text-forest">
          {korMonth}
          {isCurrentMonth && (
            <span className="ml-2 rounded-full bg-ember/20 px-2 py-0.5 text-xs text-ember">
              이번 달
            </span>
          )}
        </span>
        {!isFutureMonth && (
          <Link
            href={`/admin/reports/monthly-briefing?month=${nextMonth(monthStr)}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            다음 달 →
          </Link>
        )}
        <div className="ml-auto flex gap-2">
          <Link
            href={`/admin/reports/monthly?month=${monthStr}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            월간 보고서
          </Link>
          <button
            type="button"
            onClick={undefined}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
            // Print is handled client-side; keep as anchor for server component
          >
            인쇄
          </button>
        </div>
      </div>

      {/* ── 오류 배너 ── */}
      {fetchError && (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {fetchError} — 잠시 후 새로고침하거나 관리자에게 문의하세요.
        </div>
      )}

      {/* ── Section 1: 이번 달 현황 요약 ── */}
      <section>
        <h2 className="mb-4 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
          1. 이번 달 현황
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            title="현재 수강생"
            value={`${summary.totalActive.toLocaleString()}명`}
            sub="활성 수강 중"
          />
          <SummaryCard
            title="신규 등록"
            value={`+${summary.newEnrollments.toLocaleString()}명`}
            sub="이달 신규"
            highlight={summary.newEnrollments > 0}
          />
          <SummaryCard
            title="퇴원·취소"
            value={`-${summary.withdrawals.toLocaleString()}명`}
            sub="이달 퇴원/취소"
            warn={summary.withdrawals > 0}
          />
          <SummaryCard
            title="순 증감"
            value={`${summary.netChange >= 0 ? "+" : ""}${summary.netChange.toLocaleString()}명`}
            sub="신규 - 퇴원"
            highlight={summary.netChange > 0}
            warn={summary.netChange < 0}
          />
        </div>
      </section>

      {/* ── Section 2: 위험 학생 ── */}
      <section>
        <h2 className="mb-4 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
          2. 위험 학생
          <span className="ml-2 text-xs font-normal text-slate">
            (결시 3회 초과 또는 평균 50점 미만)
          </span>
          {atRisk.length > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 text-xs font-bold text-red-700">
              {atRisk.length}
            </span>
          )}
        </h2>

        {atRisk.length === 0 ? (
          <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-8 text-center">
            <p className="text-sm font-medium text-forest">이달 위험 학생이 없습니다.</p>
            <p className="mt-1 text-xs text-slate">결시 3회 초과 또는 평균 50점 미만인 학생 없음</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-red-200 bg-white">
            <div className="border-b border-red-100 bg-red-50/60 px-5 py-3">
              <p className="text-xs font-medium text-red-700">
                총 {atRisk.length}명의 학생이 집중 관리가 필요합니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    {["학번", "이름", "연락처", "결시 횟수", "평균 점수", "출석률", "위험 사유"].map(
                      (h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap bg-red-50/40 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {atRisk.map((s) => (
                    <tr key={s.examNumber} className="transition-colors hover:bg-red-50/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <a
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ink transition-colors hover:text-ember"
                        >
                          {s.examNumber}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <a
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ink transition-colors hover:text-ember"
                        >
                          {s.name}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                        {s.mobile ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`font-semibold tabular-nums ${
                            s.absCount > 3 ? "text-red-600" : "text-slate"
                          }`}
                        >
                          {s.absCount}회
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {s.avgScore !== null ? (
                          <span
                            className={`font-semibold tabular-nums ${
                              s.avgScore < 50 ? "text-red-600" : "text-ink"
                            }`}
                          >
                            {s.avgScore}점
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums">
                        {s.attendanceRate !== null ? (
                          <span
                            className={
                              s.attendanceRate < 80 ? "font-semibold text-amber-600" : "text-slate"
                            }
                          >
                            {s.attendanceRate}%
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.riskReasons.map((reason) => (
                            <span
                              key={reason}
                              className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 3: 우수 학생 ── */}
      <section>
        <h2 className="mb-4 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
          3. 우수 학생
          <span className="ml-2 text-xs font-normal text-slate">
            (평균 80점 초과 및 출석률 95% 초과)
          </span>
          {top.length > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest/20 px-1.5 text-xs font-bold text-forest">
              {top.length}
            </span>
          )}
        </h2>

        {top.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center">
            <p className="text-sm text-slate">이달 우수 학생 기준을 충족하는 학생이 없습니다.</p>
            <p className="mt-1 text-xs text-slate">평균 80점 초과 + 출석률 95% 초과 기준</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-forest/30 bg-white">
            <div className="border-b border-forest/10 bg-forest/5 px-5 py-3">
              <p className="text-xs font-medium text-forest">
                총 {top.length}명의 우수 학생이 있습니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    {["학번", "이름", "연락처", "평균 점수", "출석률"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap bg-forest/5 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {top.map((s, idx) => (
                    <tr key={s.examNumber} className="transition-colors hover:bg-forest/5">
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <a
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ink transition-colors hover:text-ember"
                        >
                          {s.examNumber}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          {idx < 3 && (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                              {idx + 1}
                            </span>
                          )}
                          <a
                            href={`/admin/students/${s.examNumber}`}
                            className="font-medium text-ink transition-colors hover:text-ember"
                          >
                            {s.name}
                          </a>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                        {s.mobile ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-semibold tabular-nums text-forest">{s.avgScore}점</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-semibold tabular-nums text-forest">
                          {s.attendanceRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 4: 수강반별 현황 ── */}
      <section>
        <h2 className="mb-4 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
          4. 수강반별 현황
        </h2>

        {cohortStats.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center">
            <p className="text-sm text-slate">활성 수강반이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    {["기수명", "분류", "수강인원", "평균 점수", "출석률", "상세"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {cohortStats.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-mist/40">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{c.name}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          {EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink tabular-nums">
                        {c.activeStudents.toLocaleString()}명
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {c.avgScore !== null ? (
                          <span
                            className={`font-semibold ${
                              c.avgScore < 50
                                ? "text-red-600"
                                : c.avgScore > 75
                                  ? "text-forest"
                                  : "text-ink"
                            }`}
                          >
                            {c.avgScore}점
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {c.attendanceRate !== null ? (
                          <span
                            className={`font-semibold ${
                              c.attendanceRate < 80
                                ? "text-amber-600"
                                : c.attendanceRate >= 95
                                  ? "text-forest"
                                  : "text-ink"
                            }`}
                          >
                            {c.attendanceRate}%
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <a
                          href={`/admin/settings/cohorts/${c.id}`}
                          className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                        >
                          상세 보기
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── 하단 링크 ── */}
      <div className="print:hidden flex flex-wrap gap-3">
        <Link
          href="/admin/reports/monthly"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 월간 운영 보고서
        </Link>
        <a
          href="/admin/students"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          학생 목록
        </a>
        <a
          href="/admin/approvals/bulk-absence"
          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
        >
          결석계 일괄 처리 →
        </a>
      </div>

      {/* ── 인쇄 스타일 ── */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .print\\:hidden { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 15mm; }
  section { break-inside: avoid; }
}
          `.trim(),
        }}
      />
    </div>
  );
}
