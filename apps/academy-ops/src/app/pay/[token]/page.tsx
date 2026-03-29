import { notFound } from "next/navigation";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { getPrisma } from "@/lib/prisma";
import { PaySection } from "./PaySection";

export const dynamic = "force-dynamic";

const STEPS = ["링크 확인", "정보 확인", "결제", "완료"] as const;

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={label} className="flex items-center">
            {idx > 0 && (
              <div
                className={`h-px w-8 sm:w-12 ${isDone ? "bg-forest" : "bg-ink/15"}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                  isDone
                    ? "bg-forest text-white"
                    : isActive
                      ? "bg-ember text-white"
                      : "bg-ink/10 text-slate"
                }`}
              >
                {isDone ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`text-[10px] font-medium ${
                  isActive ? "text-ember" : isDone ? "text-forest" : "text-slate"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function PayPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const link = await getPrisma().paymentLink.findUnique({
    where: { token },
    include: {
      course: {
        select: { name: true, cohortStartDate: true, cohortEndDate: true },
      },
    },
  });

  if (!link) {
    notFound();
  }

  const branding = await getAcademyRuntimeBranding();
  const now = new Date();
  const isExpired = link.expiresAt < now || link.status === "EXPIRED";
  const isDisabled = link.status === "DISABLED";
  const isUsedUp =
    link.status === "USED_UP" || (link.maxUsage != null && link.usageCount >= link.maxUsage);
  const isUnavailable = isExpired || isDisabled || isUsedUp;

  // 현재 단계 결정: 사용 불가는 1단계, 정상은 2단계 (정보 확인 중)
  const currentStep = isUnavailable ? 1 : 2;

  const formatDate = (d: Date | null) =>
    d
      ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
      : null;

  const formatDateTime = (d: Date) => {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const hoursLeft = Math.floor((link.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

  return (
    <div className="min-h-screen bg-mist">
      {/* Mobile-optimized layout */}
      <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            {branding.academyName}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-ink">온라인 결제</h1>
          <p className="mt-1 text-sm text-slate">결제 전 아래 정보를 확인해 주세요.</p>
        </div>

        {/* Step bar */}
        <div className="mb-6">
          <StepBar current={currentStep} />
        </div>

        {/* Main card */}
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-sm">
          {/* Title section */}
          <div className="border-b border-ink/5 p-6">
            <h2 className="text-xl font-semibold text-ink">{link.title}</h2>
            {link.course && (
              <p className="mt-1 text-sm text-slate">{link.course.name}</p>
            )}
            {(link.course?.cohortStartDate || link.course?.cohortEndDate) && (
              <p className="mt-1 text-xs text-slate">
                수강 기간: {formatDate(link.course.cohortStartDate) ?? "??"} ~{" "}
                {formatDate(link.course.cohortEndDate) ?? "??"}
              </p>
            )}
          </div>

          {/* Pricing section */}
          <div className="space-y-3 p-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate">결제 금액</span>
              <span className="tabular-nums font-medium text-ink">
                {link.amount.toLocaleString()}원
              </span>
            </div>
            {link.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate">할인</span>
                <span className="tabular-nums font-medium text-red-600">
                  -{link.discountAmount.toLocaleString()}원
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-ink/5 pt-3">
              <span className="font-semibold text-ink">최종 결제 금액</span>
              <span className="text-xl font-bold tabular-nums text-forest">
                {link.finalAmount.toLocaleString()}원
              </span>
            </div>
            {link.allowPoint && (
              <p className="text-xs text-slate">* 아래에서 포인트 사용 가능</p>
            )}
          </div>

          {/* Expiry info (active only) */}
          {!isUnavailable && (
            <div className="mx-6 mb-4 rounded-2xl border border-ink/10 bg-mist/50 px-4 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate">링크 만료</span>
                <span
                  className={`font-semibold ${hoursLeft < 24 ? "text-amber-700" : "text-ink"}`}
                >
                  {formatDateTime(link.expiresAt)}
                  {hoursLeft >= 0 && hoursLeft < 24 && (
                    <span className="ml-1 text-amber-600">({hoursLeft}시간 후)</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Action area */}
          {isUnavailable ? (
            <div className="px-6 pb-6">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-red-700">
                  {isDisabled
                    ? "이 결제 링크는 비활성화되었습니다."
                    : isExpired
                      ? "이 결제 링크는 만료되었습니다."
                      : "이 결제 링크는 최대 사용 횟수에 도달했습니다."}
                </p>
                <p className="mt-1 text-xs text-red-600">학원에 문의해 주세요.</p>
                {branding.phoneHref ? (
                  <a
                    href={branding.phoneHref}
                    className="mt-4 block w-full rounded-full bg-red-600 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    {branding.phone} 전화하기
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <PaySection
              linkId={link.id}
              token={token}
              orderName={link.title}
              finalAmount={link.finalAmount}
              allowPoint={link.allowPoint}
              contactPhone={branding.phone}
              contactPhoneHref={branding.phoneHref}
            />
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate">
          <p className="font-medium text-ink">{branding.academyName}</p>
          {branding.address ? <p className="mt-1">{branding.address}</p> : null}
          <p className="mt-0.5">
            {branding.phoneHref ? (
              <a href={branding.phoneHref} className="text-ember transition hover:underline">
                {branding.phone}
              </a>
            ) : (
              <span>{branding.phone ?? "학원 문의"}</span>
            )}
            {" · "}
            평일 09~21시 / 주말 09~18시
          </p>
        </div>
      </div>
    </div>
  );
}
