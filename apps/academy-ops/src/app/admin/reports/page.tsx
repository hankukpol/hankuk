import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const yearStart = new Date(year, 0, 1);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // Quick stats
  const [monthlyPayments, ytdPayments, activeEnrollments] = await Promise.all([
    getPrisma().payment.aggregate({
      where: { status: "APPROVED", createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { netAmount: true },
    }).catch(() => ({ _sum: { netAmount: 0 } })),
    getPrisma().payment.aggregate({
      where: { status: "APPROVED", createdAt: { gte: yearStart } },
      _sum: { netAmount: true },
    }).catch(() => ({ _sum: { netAmount: 0 } })),
    getPrisma().courseEnrollment.count({
      where: { status: "ACTIVE" },
    }).catch(() => 0),
  ]);

  const monthlyTotal = monthlyPayments._sum?.netAmount ?? 0;
  const ytdTotal = ytdPayments._sum?.netAmount ?? 0;

  function formatKRW(n: number) {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
    if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
    return `${n.toLocaleString()}원`;
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        보고서
      </div>
      <h1 className="mt-5 text-3xl font-semibold">보고서 센터</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수납 실적, 수강 현황, 출결 현황을 월별·연간·기간별로 조회합니다.
      </p>

      {/* Quick KPI */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번 달 수납</p>
          <p className="mt-2 text-2xl font-bold text-ink">{formatKRW(monthlyTotal)}</p>
          <p className="mt-1 text-xs text-slate">{year}년 {month}월</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">연간 누적 수납</p>
          <p className="mt-2 text-2xl font-bold text-ink">{formatKRW(ytdTotal)}</p>
          <p className="mt-1 text-xs text-slate">{year}년 1월~{month}월</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">현재 수강생</p>
          <p className="mt-2 text-2xl font-bold text-ink">{activeEnrollments.toLocaleString()}명</p>
          <p className="mt-1 text-xs text-slate">수강중 (ACTIVE)</p>
        </div>
      </div>

      {/* Report Links */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Link
          href={`/admin/reports/monthly?month=${monthStr}`}
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-ember/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">월간</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">월간 보고서</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                선택한 달의 수납 합계, 신규 수강, 환불, 미납 현황을 확인합니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-ember transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">현재: {year}년 {month}월 →</div>
        </Link>

        <Link
          href={`/admin/reports/annual?year=${year}`}
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-forest/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">연간</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">연간 보고서</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                12개월 트렌드, 월별 수납 추이, 수강생 변화를 한눈에 봅니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-forest transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">현재: {year}년 →</div>
        </Link>

        <Link
          href={
            "/admin/reports/year-end?year=" + year
          }
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-ember/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">{"\uC5F0\uB9D0"}</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">{"\uC5F0\uB9D0 \uC2E4\uC801 \uBCF4\uACE0\uC11C"}</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                {"\uC5F0\uAC04 \uC2E4\uC218\uB0A9, \uAE30\uC218, \uD2B9\uAC15, \uC8FC\uC694 \uB4F1\uB85D \uD559\uC0DD\uC744 \uACB0\uC0B0\uD615\uC73C\uB85C \uBCF4\uB294 \uBCF4\uACE0\uC11C\uC785\uB2C8\uB2E4."}
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-ember transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">{"\uD5C8\uBE0C \uAE30\uC900 \uC5F0\uAC04 \uACB0\uC0B0 \uD654\uBA74 \u2192"}</div>
        </Link>

        <Link
          href="/admin/reports/weekly"
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-ink/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-ink/10 px-3 py-1 text-xs font-semibold text-ink">주간</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">주간 성적 보고서</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                활성 기간의 직렬별 최신 주차 성적·출결·위험군 현황을 Excel 파일로 다운로드합니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-ink transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">Excel(.xlsx) 다운로드 →</div>
        </Link>

        <Link
          href="/admin/reports/enrollment-status"
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-forest/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">수강생</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">수강생 현황 보고서</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                수강반별 활성·대기·휴원·수료·퇴원 인원 분포를 월별로 조회합니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-forest transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">반별 등록 현황 →</div>
        </Link>

        <Link
          href="/admin/reports/attendance"
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-ember/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">출결</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">출결 현황 보고서</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                시험 기간별 회차 출석·결시 현황과 출석률을 조회합니다. 80% 미만 회차를 자동으로 표시합니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-ember transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">기간별 출석률 분석 →</div>
        </Link>

        <Link
          href="/admin/reports/operations"
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-forest/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">운영</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">운영 현황 요약</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                이번 주 강의, 이달 수납, 수강생 카테고리별 현황, 처리 필요 알림을 한 화면에서 확인합니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-forest transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">실시간 운영 현황 →</div>
        </Link>

        <Link
          href={`/admin/reports/instructor-settlement?month=${monthStr}`}
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-ember/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">강사</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">강사 정산 보고서</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                월별 강사·직원의 수납 처리 건수, 정산금액, 세금(3.3%) 공제, 실수령액을 한눈에 확인합니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-ember transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">현재: {year}년 {month}월 →</div>
        </Link>

        <Link
          href={`/admin/reports/score-notices?month=${monthStr}`}
          className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-forest/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">성적</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">성적 통지표</h2>
              <p className="mt-2 text-sm text-slate leading-6">
                월별 수강생 성적 통지표를 개별로 출력합니다. 과목별 평균, 석차, 출결 현황, 담임 코멘트가 포함된 A4 인쇄용 문서입니다.
              </p>
            </div>
            <svg className="mt-1 h-6 w-6 text-slate group-hover:text-forest transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-6 text-xs text-slate">현재: {year}년 {month}월 →</div>
        </Link>
      </div>

      {/* Quick Navigation */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">관련 페이지</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin/settlements/daily" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">일계표</Link>
          <Link href="/admin/settlements/monthly" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">월계표</Link>
          <Link href="/admin/payments" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">수납 내역</Link>
          <Link href="/admin/payments/aging-report" className="inline-flex items-center gap-1.5 rounded-lg border border-ember/20 bg-ember/5 px-3 py-1.5 text-sm text-ember hover:bg-ember/10">미수금 연령 분석</Link>
          <Link href="/admin/enrollments" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">수강 목록</Link>
          <Link href="/admin/staff-settlements" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">강사 정산</Link>
          <Link href={`/admin/reports/instructor-settlement?month=${monthStr}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ember/20 bg-ember/5 px-3 py-1.5 text-sm text-ember hover:bg-ember/10">강사 정산 보고서</Link>
          <Link href="/admin/reports/enrollment-status" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">수강생 현황</Link>
          <Link href="/admin/reports/attendance" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">출결 현황</Link>
          <Link href="/admin/reports/operations" className="inline-flex items-center gap-1.5 rounded-lg border border-forest/20 bg-forest/5 px-3 py-1.5 text-sm text-forest hover:bg-forest/10">운영 현황 요약</Link>
          <Link href="/admin/reports/monthly-briefing" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist">월간 브리핑</Link>
          <Link href={`/admin/reports/score-notices?month=${monthStr}`} className="inline-flex items-center gap-1.5 rounded-lg border border-forest/20 bg-forest/5 px-3 py-1.5 text-sm text-forest hover:bg-forest/10">성적 통지표</Link>
        </div>
      </div>
    </div>
  );
}
