import Link from "next/link";
import { CodeType } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { applyDiscountCodeAcademyScope } from "@/lib/discount-codes/service";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function StudentReferralPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Referral Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              추천인 코드는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에서는 추천인 코드를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Referral Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              추천인 코드는 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 내 추천 코드와 추천 내역을 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/referral" />
        </div>
      </main>
    );
  }

  const derivedCode = `REF-${viewer.examNumber}`;
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  const referralCode = await getPrisma().discountCode.findFirst({
    where: applyDiscountCodeAcademyScope(
      {
        code: derivedCode,
        type: CodeType.REFERRAL,
      },
      viewer.academyId ?? null,
    ),
    select: {
      id: true,
      code: true,
      discountType: true,
      discountValue: true,
      usageCount: true,
      maxUsage: true,
      validUntil: true,
      isActive: true,
      usages: {
        select: {
          id: true,
          usedAt: true,
          student: {
            select: {
              name: true,
              examNumber: true,
            },
          },
          payment: {
            select: {
              id: true,
              netAmount: true,
            },
          },
        },
        orderBy: { usedAt: "desc" },
      },
    },
  });

  const usages = referralCode?.usages ?? [];
  const displayCode = referralCode?.code ?? derivedCode;
  const remainingCount =
    referralCode?.maxUsage != null ? Math.max(0, referralCode.maxUsage - referralCode.usageCount) : null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Referral
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                추천인 코드
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                친구에게 내 추천 코드를 안내하고 사용 내역을 확인하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
            My Referral Code
          </p>
          <h2 className="mt-1 text-xl font-semibold">내 추천 코드</h2>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 rounded-[20px] border-2 border-dashed border-ember/40 bg-ember/5 px-6 py-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember/70">
                추천 코드
              </p>
              <p className="mt-2 text-3xl font-bold tracking-widest text-ember sm:text-4xl">
                {displayCode}
              </p>
              {referralCode && !referralCode.isActive ? (
                <p className="mt-2 text-xs text-slate">현재 비활성 상태의 코드입니다.</p>
              ) : null}
              {referralCode?.validUntil ? (
                <p className="mt-1 text-xs text-slate">
                  유효 기간: {formatDate(referralCode.validUntil)}까지
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <CopyButton text={displayCode} />
            <div className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-[#FEE500]/40 bg-[#FEE500]/10 px-4 py-2 text-sm font-semibold text-[#3C1E1E]/70">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#3C1E1E]/60">
                <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98C6.056 17.994 5.5 17.561 5.5 17v-1.338c-1.804-.293-3.254-1.586-3.504-3.297A41.369 41.369 0 0 1 1.5 9c0-1.863.124-3.697.365-5.495.167-1.247 1.108-2.18 2.268-2.435Z" />
                <path d="M7.5 8.997c0-1.715 1.353-3.23 3.24-3.492A41.216 41.216 0 0 1 14 5.25c.826 0 1.643.028 2.449.084 1.832.132 3.051 1.605 3.051 3.247v2.295c0 1.642-1.219 3.115-3.051 3.247-.664.048-1.333.073-2.006.073l-3.19 3.19a.75.75 0 0 1-1.253-.557V14.7c-.933-.19-1.75-.707-2.257-1.383A3.476 3.476 0 0 1 7.5 11.243V8.997Z" />
              </svg>
              카카오톡으로 공유
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-forest/10 text-forest">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-forest">추천 혜택 안내</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-forest/80">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest/50" />
                  친구가 이 코드를 사용해 수강 등록하면 추천 혜택이 적용될 수 있습니다.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest/50" />
                  자세한 혜택은 학원 상담실로 문의해 주세요.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-forest/50" />
                  수강 등록 시 직원에게 추천 코드를 직접 알려주면 됩니다.
                </li>
              </ul>
              <p className="mt-3 text-xs text-forest/60">
                문의: {branding.phone ?? "학원 문의"} (평일 09~21시 / 주말 09~18시)
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
            Referral History
          </p>
          <h2 className="mt-1 text-xl font-semibold">추천 이력</h2>
          <p className="mt-1 text-sm text-slate">내 추천 코드를 사용한 등록 내역입니다.</p>

          {usages.length === 0 ? (
            <div className="mt-5 rounded-[20px] border border-dashed border-ink/10 px-5 py-8 text-center text-sm text-slate">
              아직 추천 이력이 없습니다.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">사용일</th>
                    <th className="px-4 py-3 font-semibold">학생명</th>
                    <th className="px-4 py-3 font-semibold">수험번호</th>
                    <th className="px-4 py-3 font-semibold text-right">결제 금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {usages.map((usage) => (
                    <tr key={usage.id} className="hover:bg-mist/40">
                      <td className="whitespace-nowrap px-4 py-3 text-slate">{formatDate(usage.usedAt)}</td>
                      <td className="px-4 py-3 font-medium">{usage.student.name}</td>
                      <td className="px-4 py-3 text-slate">{usage.student.examNumber}</td>
                      <td className="px-4 py-3 text-right">{usage.payment.netAmount.toLocaleString("ko-KR")}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {usages.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                <p className="text-xs text-slate">추천 등록 수</p>
                <p className="mt-2 text-xl font-semibold">{usages.length}건</p>
              </article>
              {referralCode ? (
                <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                  <p className="text-xs text-slate">코드 누적 사용</p>
                  <p className="mt-2 text-xl font-semibold">{referralCode.usageCount}회</p>
                </article>
              ) : null}
              {remainingCount != null ? (
                <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                  <p className="text-xs text-slate">남은 사용 가능 횟수</p>
                  <p className="mt-2 text-xl font-semibold">{remainingCount}회</p>
                </article>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="flex justify-center pb-2">
          <Link
            href="/student/points"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ember/90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.18.161.195.145.438.27.72.364V6.704a2.24 2.24 0 0 0-.84.274c-.423.277-.88.85-.88 1.22 0 .37.1.523.32.594.075.025.151.038.228.038l.272-.27ZM10 1a9 9 0 1 0 0 18A9 9 0 0 0 10 1ZM9.25 6.75a.75.75 0 0 1 1.5 0v.317c.909.204 1.75.86 1.75 1.933 0 1.24-.999 1.976-2.066 2.157l.316 1.474a.75.75 0 1 1-1.461.314L9 11.24c-.909-.204-1.75-.86-1.75-1.933a.75.75 0 0 1 1.5 0c0 .077.04.227.227.411.13.129.315.244.523.325V8.3a2.24 2.24 0 0 0-.723-.364C8.3 7.788 7.5 7.306 7.5 6.307c0-.998.86-1.752 1.75-2.054V4a.75.75 0 0 1 1.5 0v.253c.909.204 1.75.86 1.75 1.933 0 .29-.06.561-.169.806a.75.75 0 1 1-1.378-.596c.005-.012.047-.21.047-.21a.75.75 0 0 0-1.5 0v.316c.207.078.39.192.52.321Z" />
            </svg>
            포인트 내역 확인
          </Link>
        </div>
      </div>
    </main>
  );
}
