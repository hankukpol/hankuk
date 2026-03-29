import Link from "next/link";
import { AdminRole, CodeType } from "@prisma/client";
import { getAcademyById, getAcademyLabel } from "@/lib/academy";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { buildDiscountCodeMonthOptions, getDiscountCodeAnalyticsData } from "@/lib/discount-codes/reporting";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ period?: string }>;
};

const CODE_TYPE_LABELS: Record<CodeType, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "등록",
  CAMPAIGN: "캠페인",
};

const CODE_TYPE_COLORS: Record<CodeType, string> = {
  REFERRAL: "text-purple-700 bg-purple-50 border-purple-200",
  ENROLLMENT: "text-blue-700 bg-blue-50 border-blue-200",
  CAMPAIGN: "text-amber-700 bg-amber-50 border-amber-200",
};

function formatShortDate(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

export default async function DiscountCodeAnalyticsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const scope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(scope);

  if (visibleAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          설정 · 할인 코드 분석
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">할인 코드 사용 현황</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          할인 코드 분석은 지점별 운영 데이터입니다. 전체 보기 상태에서는 사용 통계를 합산하지 않고,
          상단 지점 전환기에서 먼저 지점을 선택한 뒤 확인해 주세요.
        </p>
        <div className="mt-8 rounded-[28px] border border-dashed border-amber-300 bg-amber-50/70 p-8 text-sm leading-7 text-amber-900">
          <p className="font-semibold">지점 선택이 필요합니다.</p>
          <p className="mt-2">지점을 선택하면 해당 지점의 할인 코드 사용 건수, 할인 총액, 최근 사용 이력을 확인할 수 있습니다.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/admin/settings/discount-codes" className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30">
              할인 코드 관리로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { period } = await searchParams;
  const [academy, analytics] = await Promise.all([
    getAcademyById(visibleAcademyId),
    getDiscountCodeAnalyticsData({ academyId: visibleAcademyId, period }),
  ]);
  const monthOptions = buildDiscountCodeMonthOptions();
  const maxUsageCount = Math.max(...analytics.rows.map((row) => row.periodUsageCount), 1);

  return (
    <div className="p-8 sm:p-10">
      <nav className="flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/settings/discount-codes" className="transition hover:text-ember">
          할인 코드 관리
        </Link>
        <span>/</span>
        <span className="text-ink">사용 현황</span>
      </nav>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            설정 · 할인 코드 분석
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">할인 코드 사용 현황</h1>
          <p className="mt-2 text-sm text-slate">
            현재 지점: <span className="font-semibold text-ink">{getAcademyLabel(academy)}</span>
          </p>
        </div>
        <Link href="/admin/settings/discount-codes" className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember">
          할인 코드 관리로 돌아가기
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="?period=current" className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${analytics.period === "current" ? "border-ink/40 bg-ink text-white" : "border-ink/10 bg-white text-slate hover:border-ink/20"}`}>
          이번 달
        </Link>
        <Link href="?period=all" className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${analytics.period === "all" ? "border-ink/40 bg-ink text-white" : "border-ink/10 bg-white text-slate hover:border-ink/20"}`}>
          전체 기간
        </Link>
        <form method="GET" className="flex items-center gap-2">
          <select name="period" defaultValue={analytics.period !== "current" && analytics.period !== "all" ? analytics.period : ""} className="rounded-2xl border border-ink/20 px-3 py-2 text-sm outline-none focus:border-forest">
            <option value="">월 선택...</option>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30">
            적용
          </button>
        </form>
      </div>
      <p className="mt-3 text-xs text-slate">
        현재 조회 기간: <span className="font-semibold text-ink">{analytics.periodLabel}</span>
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">전체 코드 수</p>
          <p className="mt-3 text-3xl font-bold">{analytics.summary.totalCodes}</p>
          <p className="mt-1.5 text-xs text-slate">활성 {analytics.summary.activeCodes}건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">사용된 코드</p>
          <p className="mt-3 text-3xl font-bold">{analytics.summary.usedCodes}</p>
          <p className="mt-1.5 text-xs text-slate">조회 기간 기준</p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-ember">총 사용 횟수</p>
          <p className="mt-3 text-3xl font-bold text-ember">{analytics.summary.totalUsageCount}</p>
          <p className="mt-1.5 text-xs text-slate">{analytics.periodLabel}</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-forest">총 할인 금액</p>
          <p className="mt-3 text-2xl font-bold text-forest tabular-nums">{analytics.summary.totalDiscountAmount.toLocaleString("ko-KR")}원</p>
          <p className="mt-1.5 text-xs text-slate">만료 임박 {analytics.summary.expiringSoonCount}건</p>
        </div>
      </div>

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-base font-semibold">코드별 사용 현황</h2>
          <p className="mt-0.5 text-xs text-slate">{analytics.periodLabel} 기준 각 코드의 사용 통계</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["코드", "유형", "할인 방식", "이번 기간 사용", "누적 사용", "기간 할인액", "유효 기간", "상태"].map((header) => (
                  <th key={header} className="bg-mist/50 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {analytics.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate">할인 코드가 없습니다.</td>
                </tr>
              ) : (
                analytics.rows.map((row) => {
                  const barPct = Math.round((row.periodUsageCount / maxUsageCount) * 100);
                  return (
                    <tr key={row.id} className="transition hover:bg-mist/20">
                      <td className="px-5 py-4">
                        <Link href={`/admin/settings/discount-codes/${row.id}`} className="font-mono text-sm font-semibold text-ember hover:underline">{row.code}</Link>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${CODE_TYPE_COLORS[row.type]}`}>{CODE_TYPE_LABELS[row.type]}</span>
                      </td>
                      <td className="px-5 py-4 text-slate">{row.discountType === "RATE" ? `${row.discountValue}%` : `${row.discountValue.toLocaleString("ko-KR")}원`}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-ink/10">
                            <div className="h-full rounded-full bg-ember/70 transition-all duration-500" style={{ width: `${Math.max(barPct, row.periodUsageCount > 0 ? 5 : 0)}%` }} />
                          </div>
                          <span className="tabular-nums font-semibold text-ink">{row.periodUsageCount}건</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 tabular-nums text-slate">{row.totalUsageCount}{row.maxUsage != null ? ` / ${row.maxUsage}` : " / 무제한"}</td>
                      <td className="px-5 py-4 tabular-nums font-semibold text-forest">{row.periodTotalDiscount > 0 ? `${row.periodTotalDiscount.toLocaleString("ko-KR")}원` : "-"}</td>
                      <td className="px-5 py-4 text-xs text-slate">{row.validUntil ? row.validUntil.slice(0, 10) : "종료 없음"}</td>
                      <td className="px-5 py-4">{row.isActive ? <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">활성</span> : <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">비활성</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-base font-semibold">최근 사용 이력</h2>
          <p className="mt-0.5 text-xs text-slate">최근 20건의 할인 코드 사용 내역입니다.</p>
        </div>
        {analytics.recentUsages.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">해당 기간의 할인 코드 사용 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["일자", "학생", "연락처", "코드", "할인 금액"].map((header) => (
                    <th key={header} className="bg-mist/50 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {analytics.recentUsages.map((usage) => (
                  <tr key={usage.id} className="transition hover:bg-mist/20">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate">{formatShortDate(usage.usedAt)}</td>
                    <td className="px-5 py-3 font-semibold text-ink">
                      <Link href={`/admin/students/${usage.examNumber}`} className="transition hover:text-ember hover:underline">{usage.studentName}</Link>
                    </td>
                    <td className="px-5 py-3 text-slate">{usage.mobile ?? "-"}</td>
                    <td className="px-5 py-3"><span className="font-mono text-xs font-semibold text-ember">{usage.code}</span></td>
                    <td className="px-5 py-3 tabular-nums font-semibold text-forest">{usage.discountAmount > 0 ? `${usage.discountAmount.toLocaleString("ko-KR")}원` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}