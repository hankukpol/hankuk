import { AdminRole, PassType, ExamType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

// Key pass types for the stats page (positive outcomes only)
const POSITIVE_TYPES: PassType[] = [PassType.WRITTEN_PASS, PassType.FINAL_PASS, PassType.APPOINTED];

function getPassDate(r: {
  writtenPassDate: Date | null;
  finalPassDate: Date | null;
  appointedDate: Date | null;
  createdAt: Date;
}): Date {
  return r.finalPassDate ?? r.writtenPassDate ?? r.appointedDate ?? r.createdAt;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function GraduateStatsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  const records = await prisma.graduateRecord.findMany({
    include: {
      student: { select: { name: true, examType: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  // ── KPI: cumulative totals ────────────────────────────────────────────────
  const totalCumulative = records.filter((r) => POSITIVE_TYPES.includes(r.passType)).length;

  const thisYearRecords = records.filter((r) => {
    const d = getPassDate(r);
    return d.getFullYear() === currentYear && POSITIVE_TYPES.includes(r.passType);
  });
  const thisYearCount = thisYearRecords.length;

  const thisMonthCount = records.filter((r) => {
    const d = getPassDate(r);
    return (
      d.getFullYear() === currentYear &&
      d.getMonth() + 1 === currentMonth &&
      POSITIVE_TYPES.includes(r.passType)
    );
  }).length;

  // 최종합격 → 임용 전환율
  const finalPassTotal = records.filter((r) => r.passType === PassType.FINAL_PASS || r.passType === PassType.APPOINTED).length;
  const appointedTotal = records.filter((r) => r.passType === PassType.APPOINTED).length;
  const conversionRate =
    finalPassTotal > 0 ? Math.round((appointedTotal / finalPassTotal) * 100) : null;

  // ── 연도별 현황 (최근 5년) ────────────────────────────────────────────────
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i).reverse();

  function countByTypeYear(type: PassType, year: number) {
    return records.filter((r) => {
      if (r.passType !== type) return false;
      return getPassDate(r).getFullYear() === year;
    }).length;
  }

  type YearRow = {
    year: number;
    written: number;
    final: number;
    appointed: number;
    total: number;
  };

  const yearlyRows: YearRow[] = years.map((year) => {
    const written = countByTypeYear(PassType.WRITTEN_PASS, year);
    const final = countByTypeYear(PassType.FINAL_PASS, year);
    const appointed = countByTypeYear(PassType.APPOINTED, year);
    return { year, written, final, appointed, total: written + final + appointed };
  });

  // ── 월별 추이 (올해) ──────────────────────────────────────────────────────
  type MonthRow = {
    month: number;
    written: number;
    final: number;
    appointed: number;
    total: number;
  };

  const monthlyRows: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const written = records.filter(
      (r) =>
        r.passType === PassType.WRITTEN_PASS &&
        getPassDate(r).getFullYear() === currentYear &&
        getPassDate(r).getMonth() + 1 === month,
    ).length;
    const final = records.filter(
      (r) =>
        r.passType === PassType.FINAL_PASS &&
        getPassDate(r).getFullYear() === currentYear &&
        getPassDate(r).getMonth() + 1 === month,
    ).length;
    const appointed = records.filter(
      (r) =>
        r.passType === PassType.APPOINTED &&
        getPassDate(r).getFullYear() === currentYear &&
        getPassDate(r).getMonth() + 1 === month,
    ).length;
    return { month, written, final, appointed, total: written + final + appointed };
  });

  const maxMonthlyTotal = Math.max(...monthlyRows.map((r) => r.total), 1);

  // ── 시험 유형별 분포 ──────────────────────────────────────────────────────
  type ExamTypeRow = {
    examType: ExamType;
    written: number;
    final: number;
    appointed: number;
    total: number;
  };

  const examTypeRows: ExamTypeRow[] = Object.values(ExamType).map((et) => {
    const subset = records.filter(
      (r) => r.student.examType === et && POSITIVE_TYPES.includes(r.passType),
    );
    const written = subset.filter((r) => r.passType === PassType.WRITTEN_PASS).length;
    const final = subset.filter((r) => r.passType === PassType.FINAL_PASS).length;
    const appointed = subset.filter((r) => r.passType === PassType.APPOINTED).length;
    return { examType: et, written, final, appointed, total: subset.length };
  });

  const examTypeTotal = examTypeRows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "합격자 관리", href: "/admin/graduates" },
          { label: "합격자 통계" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
          합격자 관리
        </div>
        <h1 className="mt-4 text-3xl font-semibold">합격자 통계</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          필기합격·최종합격·임용 현황 통계 — 연도별·월별·시험 유형별 분포를 확인합니다.
        </p>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">총 누적 합격자</p>
          <p className="mt-1 text-3xl font-bold text-ink">
            {totalCumulative}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold text-forest">{currentYear}년 합격자</p>
          <p className="mt-1 text-3xl font-bold text-forest">
            {thisYearCount}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold text-sky-700">이번 달 합격자</p>
          <p className="mt-1 text-3xl font-bold text-sky-700">
            {thisMonthCount}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold text-amber-700">최종합격 → 임용 전환율</p>
          <p className="mt-1 text-3xl font-bold text-amber-700">
            {conversionRate !== null ? `${conversionRate}%` : "—"}
          </p>
        </div>
      </div>

      {/* ── 연도별 현황 ────────────────────────────────────────────────────── */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">연도별 합격 현황</h2>
        <p className="mt-1 text-sm text-slate">최근 5년간 합격 유형별 인원 (합격일 기준)</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                <th className="pb-3 pr-6">연도</th>
                <th className="pb-3 pr-6 text-center text-sky-700">필기합격</th>
                <th className="pb-3 pr-6 text-center text-forest">최종합격</th>
                <th className="pb-3 pr-6 text-center text-amber-600">임용</th>
                <th className="pb-3 text-right font-semibold text-ink">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {[...yearlyRows].reverse().map((row) => (
                <tr
                  key={row.year}
                  className={`transition-colors ${row.year === currentYear ? "bg-forest/5" : "hover:bg-mist/50"}`}
                >
                  <td className="py-3 pr-6 font-medium text-ink">
                    {row.year}년
                    {row.year === currentYear && (
                      <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                        올해
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-6 text-center">
                    {row.written > 0 ? (
                      <span className="font-semibold text-sky-700">{row.written}</span>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-6 text-center">
                    {row.final > 0 ? (
                      <span className="font-semibold text-forest">{row.final}</span>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-6 text-center">
                    {row.appointed > 0 ? (
                      <span className="font-semibold text-amber-600">{row.appointed}</span>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>
                  <td className="py-3 text-right font-semibold text-ink">
                    {row.total > 0 ? (
                      <>
                        {row.total}
                        <span className="ml-0.5 text-xs font-normal text-slate">명</span>
                      </>
                    ) : (
                      <span className="font-normal text-slate">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/20">
                <td className="pt-3 pr-6 text-xs font-semibold uppercase text-slate">합계</td>
                <td className="pt-3 pr-6 text-center font-semibold text-sky-700">
                  {yearlyRows.reduce((s, r) => s + r.written, 0)}
                </td>
                <td className="pt-3 pr-6 text-center font-semibold text-forest">
                  {yearlyRows.reduce((s, r) => s + r.final, 0)}
                </td>
                <td className="pt-3 pr-6 text-center font-semibold text-amber-600">
                  {yearlyRows.reduce((s, r) => s + r.appointed, 0)}
                </td>
                <td className="pt-3 text-right font-bold text-ink">
                  {yearlyRows.reduce((s, r) => s + r.total, 0)}
                  <span className="ml-0.5 text-xs font-normal text-slate">명</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── 월별 추이 (올해) ──────────────────────────────────────────────── */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">{currentYear}년 월별 합격 추이</h2>
        <p className="mt-1 text-sm text-slate">올해 월별 합격 유형별 인원 (막대 비율 표시)</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                <th className="pb-3 pr-4">월</th>
                <th className="pb-3 pr-4 text-center text-sky-700">필기</th>
                <th className="pb-3 pr-4 text-center text-forest">최종</th>
                <th className="pb-3 pr-4 text-center text-amber-600">임용</th>
                <th className="pb-3">추이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthlyRows.map((row) => {
                const barPct = Math.round((row.total / maxMonthlyTotal) * 100);
                const isPast = row.month < currentMonth;
                const isCurrent = row.month === currentMonth;
                return (
                  <tr
                    key={row.month}
                    className={`transition-colors ${
                      isCurrent ? "bg-forest/5" : isPast ? "hover:bg-mist/50" : "opacity-40"
                    }`}
                  >
                    <td className="py-2.5 pr-4 font-medium text-ink w-16">
                      {row.month}월
                      {isCurrent && (
                        <span className="ml-1.5 rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                          이번달
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-center w-16">
                      {row.written > 0 ? (
                        <span className="font-semibold text-sky-700">{row.written}</span>
                      ) : (
                        <span className="text-slate/50">0</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-center w-16">
                      {row.final > 0 ? (
                        <span className="font-semibold text-forest">{row.final}</span>
                      ) : (
                        <span className="text-slate/50">0</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-center w-16">
                      {row.appointed > 0 ? (
                        <span className="font-semibold text-amber-600">{row.appointed}</span>
                      ) : (
                        <span className="text-slate/50">0</span>
                      )}
                    </td>
                    <td className="py-2.5 w-full">
                      {row.total > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-full bg-ink/5 overflow-hidden h-2.5">
                            <div
                              className={`h-full rounded-full transition-all ${isCurrent ? "bg-forest" : "bg-ember"}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-ink tabular-nums w-8 text-right">
                            {row.total}명
                          </span>
                        </div>
                      ) : (
                        <div className="h-2.5 rounded-full bg-ink/5" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 시험 유형별 분포 ─────────────────────────────────────────────── */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">시험 유형별 합격 분포</h2>
        <p className="mt-1 text-sm text-slate">공채·경채 수험 유형별 합격자 현황 (누적 전체)</p>
        {examTypeTotal === 0 ? (
          <div className="mt-6 flex h-24 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {examTypeRows.map((row) => {
              const pct = examTypeTotal > 0 ? Math.round((row.total / examTypeTotal) * 100) : 0;
              return (
                <div key={row.examType} className="rounded-[20px] border border-ink/10 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">
                      {EXAM_TYPE_LABEL[row.examType]}
                    </span>
                    <span className="text-2xl font-bold text-ink">
                      {row.total}
                      <span className="ml-1 text-sm font-normal text-slate">명</span>
                    </span>
                  </div>
                  {/* Proportion bar */}
                  <div className="mt-3 h-2 rounded-full bg-ink/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-ember"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate">전체의 {pct}%</p>
                  {/* breakdown */}
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-sky-700">
                      필기합격 <strong>{row.written}</strong>명
                    </span>
                    <span className="text-forest">
                      최종합격 <strong>{row.final}</strong>명
                    </span>
                    <span className="text-amber-600">
                      임용 <strong>{row.appointed}</strong>명
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 관련 링크 ─────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/graduates"
          className="rounded-[28px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-forest hover:text-forest"
        >
          합격자 목록으로
        </Link>
        <Link
          href="/admin/graduates/benchmark"
          className="rounded-[28px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-forest hover:text-forest"
        >
          합격자 벤치마크 →
        </Link>
      </div>
    </div>
  );
}
