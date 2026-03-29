import { AdminRole, EnrollmentStatus, ExamCategory } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import {
  ENROLLMENT_STATUS_LABEL,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── helpers ─────────────────────────────────────────────────────────────────

function pct(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function EnrollmentStatsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const db = getPrisma();

  // ── 1. All enrollments (lightweight) ─────────────────────────────────────
  const allEnrollments = await db.courseEnrollment.findMany({
    select: {
      status: true,
      createdAt: true,
      cohortId: true,
      student: { select: { examType: true } },
    },
  });

  // ── 2. Active cohorts with enrollment counts ──────────────────────────────
  const activeCohorts = await db.cohort.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
    include: {
      enrollments: {
        select: { status: true },
      },
    },
  });

  // ── 3. Monthly trend — last 6 months ─────────────────────────────────────
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const recentEnrollments = await db.courseEnrollment.findMany({
    where: { createdAt: { gte: sixMonthsAgo } },
    select: { status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // ── derived: KPI ──────────────────────────────────────────────────────────
  const totalActive = allEnrollments.filter((e) => e.status === "ACTIVE").length;
  const newThisMonth = allEnrollments.filter(
    (e) =>
      (e.status === "ACTIVE" || e.status === "PENDING") &&
      e.createdAt >= thisMonthStart &&
      e.createdAt < nextMonthStart,
  ).length;
  const totalWaiting = allEnrollments.filter((e) => e.status === "WAITING").length;
  const cancelledThisMonth = allEnrollments.filter(
    (e) =>
      e.status === "CANCELLED" &&
      e.createdAt >= thisMonthStart &&
      e.createdAt < nextMonthStart,
  ).length;

  // ── derived: exam-type distribution (via student.examType) ───────────────
  const activeWithType = allEnrollments.filter((e) => e.status === "ACTIVE");
  const gongchaeCount = activeWithType.filter(
    (e) => e.student.examType === "GONGCHAE",
  ).length;
  const gyeongchaeCount = activeWithType.filter(
    (e) => e.student.examType === "GYEONGCHAE",
  ).length;
  const examTypeTotal = gongchaeCount + gyeongchaeCount;

  // ── derived: cohort table ─────────────────────────────────────────────────
  const cohortRows = activeCohorts.map((c) => {
    const studentCount = c.enrollments.filter(
      (e) => e.status === "ACTIVE" || e.status === "PENDING",
    ).length;
    const waitingCount = c.enrollments.filter((e) => e.status === "WAITING").length;
    return {
      id: c.id,
      name: c.name,
      examCategory: c.examCategory,
      studentCount,
      waitingCount,
      maxCapacity: c.maxCapacity,
      startDate: c.startDate,
      endDate: c.endDate,
      isActive: c.isActive,
    };
  });

  // ── derived: monthly trend ────────────────────────────────────────────────
  // Build ordered month keys for the last 6 months
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(monthKey(d));
  }

  const monthlyMap: Record<string, { newReg: number; cancelled: number }> = {};
  for (const k of monthKeys) {
    monthlyMap[k] = { newReg: 0, cancelled: 0 };
  }
  for (const e of recentEnrollments) {
    const k = monthKey(e.createdAt);
    if (!(k in monthlyMap)) continue;
    if (e.status === "ACTIVE" || e.status === "PENDING") {
      monthlyMap[k].newReg += 1;
    } else if (e.status === "CANCELLED") {
      monthlyMap[k].cancelled += 1;
    }
  }

  // ── derived: status summary ───────────────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const e of allEnrollments) {
    statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1;
  }

  const statusOrder: EnrollmentStatus[] = [
    "ACTIVE",
    "PENDING",
    "WAITING",
    "SUSPENDED",
    "COMPLETED",
    "WITHDRAWN",
    "CANCELLED",
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="inline-flex w-fit rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          수강 통계
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">수강 현황 통계</h1>
        <p className="text-sm text-slate">
          수강 상태별·기수별·시험유형별 등록 현황을 한눈에 확인합니다.
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="전체 수강생"
          value={totalActive.toLocaleString()}
          sub="ACTIVE 상태"
          valueClass="text-forest"
        />
        <KpiCard
          label="이번 달 신규"
          value={newThisMonth.toLocaleString()}
          sub="이번 달 등록"
          valueClass="text-ember"
        />
        <KpiCard
          label="대기자"
          value={totalWaiting.toLocaleString()}
          sub="WAITING 상태"
          valueClass={totalWaiting > 0 ? "text-amber-600" : "text-ink"}
        />
        <KpiCard
          label="이번 달 해지"
          value={cancelledThisMonth.toLocaleString()}
          sub="이번 달 취소"
          valueClass={cancelledThisMonth > 0 ? "text-red-600" : "text-ink"}
        />
      </div>

      {/* ── Two-column row: exam-type dist + status summary ─────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Exam-type distribution */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold text-ink">시험 유형별 분포</h2>
          <p className="mt-0.5 text-xs text-slate">ACTIVE 수강생 기준</p>

          <div className="mt-5 space-y-4">
            <ExamTypeBar
              label="공채"
              count={gongchaeCount}
              total={examTypeTotal}
              color="bg-forest"
            />
            <ExamTypeBar
              label="경채"
              count={gyeongchaeCount}
              total={examTypeTotal}
              color="bg-ember"
            />
          </div>

          <p className="mt-4 text-right text-xs text-slate">
            합계: {examTypeTotal.toLocaleString()}명
          </p>
        </section>

        {/* Status summary */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold text-ink">수강 상태별 요약</h2>
          <p className="mt-0.5 text-xs text-slate">전체 등록 건수 기준</p>

          <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist text-left text-xs text-slate">
                  <th className="px-4 py-2.5 font-medium">상태</th>
                  <th className="px-4 py-2.5 text-right font-medium">건수</th>
                  <th className="px-4 py-2.5 text-right font-medium">비율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {statusOrder.map((s) => {
                  const cnt = statusCounts[s] ?? 0;
                  const total = allEnrollments.length;
                  return (
                    <tr key={s} className="hover:bg-mist/50">
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {ENROLLMENT_STATUS_LABEL[s]}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                        {cnt.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate">
                        {pct(cnt, total)}%
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-mist">
                  <td className="px-4 py-2.5 font-semibold text-ink">합계</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink">
                    {allEnrollments.length.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Cohort table ───────────────────────────────────────────────── */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">기수별 현황</h2>
            <p className="mt-0.5 text-xs text-slate">활성 기수만 표시</p>
          </div>
          <Link
            href="/admin/cohorts"
            className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-xs font-medium text-ink transition hover:bg-mist"
          >
            기수 현황 →
          </Link>
        </div>

        {cohortRows.length === 0 ? (
          <p className="mt-6 text-center text-sm text-slate">활성 기수가 없습니다.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs text-slate">
                  <th className="pb-2.5 pr-4 font-medium">기수명</th>
                  <th className="pb-2.5 pr-4 font-medium">시험유형</th>
                  <th className="pb-2.5 pr-4 text-right font-medium">수강생</th>
                  <th className="pb-2.5 pr-4 text-right font-medium">대기</th>
                  <th className="pb-2.5 pr-4 text-right font-medium">정원</th>
                  <th className="pb-2.5 pr-4 font-medium">시작일</th>
                  <th className="pb-2.5 font-medium">종료일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cohortRows.map((c) => (
                  <tr key={c.id} className="hover:bg-mist/40">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/admin/settings/cohorts/${c.id}`}
                        className="font-medium text-ink hover:text-forest hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          c.examCategory === "GONGCHAE"
                            ? "border-forest/20 bg-forest/10 text-forest"
                            : "border-ember/20 bg-ember/10 text-ember"
                        }`}
                      >
                        {EXAM_CATEGORY_LABEL[c.examCategory]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink">
                      {c.studentCount.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      <span
                        className={
                          c.waitingCount > 0 ? "font-medium text-amber-600" : "text-slate"
                        }
                      >
                        {c.waitingCount}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate">
                      {c.maxCapacity != null ? c.maxCapacity.toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate">
                      {formatDate(c.startDate)}
                    </td>
                    <td className="py-2.5 text-slate">
                      {formatDate(c.endDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Monthly trend ──────────────────────────────────────────────── */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold text-ink">월별 등록 추이</h2>
        <p className="mt-0.5 text-xs text-slate">최근 6개월 (신규 = ACTIVE/PENDING, 해지 = CANCELLED)</p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs text-slate">
                <th className="pb-2.5 pr-6 font-medium">월</th>
                <th className="pb-2.5 pr-6 text-right font-medium">신규 등록</th>
                <th className="pb-2.5 pr-6 text-right font-medium">해지</th>
                <th className="pb-2.5 text-right font-medium">순 증가</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthKeys.map((k) => {
                const { newReg, cancelled } = monthlyMap[k];
                const net = newReg - cancelled;
                return (
                  <tr key={k} className="hover:bg-mist/40">
                    <td className="py-2.5 pr-6 font-medium text-ink">{monthLabel(k)}</td>
                    <td className="py-2.5 pr-6 text-right tabular-nums text-forest">
                      +{newReg.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-6 text-right tabular-nums text-red-500">
                      -{cancelled.toLocaleString()}
                    </td>
                    <td
                      className={`py-2.5 text-right tabular-nums font-medium ${
                        net > 0
                          ? "text-forest"
                          : net < 0
                            ? "text-red-600"
                            : "text-slate"
                      }`}
                    >
                      {net > 0 ? "+" : ""}
                      {net.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  valueClass = "text-ink",
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-wide text-slate">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate">{sub}</p>
    </div>
  );
}

function ExamTypeBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percent = pct(count, total);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-slate">
          {count.toLocaleString()}명&nbsp;({percent}%)
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink/8">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
