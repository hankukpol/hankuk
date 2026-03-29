/**
 * 결제 결과 페이지
 *
 * PortOne v2 결제 완료 후 redirectUrl로 이동하는 페이지입니다.
 * URL 파라미터:
 *   - paymentId: 결제 성공 시 PortOne paymentId
 *   - code: 결제 실패/취소 시 오류 코드
 *   - message: 결제 실패/취소 시 오류 메시지
 */

import Link from "next/link";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";

export const dynamic = "force-dynamic";

type ResultPageProps = {
  params: { token: string };
  searchParams: {
    paymentId?: string;
    code?: string;
    message?: string;
  };
};

export default async function PayResultPage({
  params,
  searchParams,
}: ResultPageProps) {
  const { token } = params;
  const { paymentId, code, message } = searchParams;
  const branding = await getAcademyRuntimeBranding();

  const isSuccess = !code && !!paymentId;
  const isCancelled = code === "PAYMENT_CANCELLED";
  const isError = !!code && !isCancelled;

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            {branding.academyName}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-ink">결제 결과</h1>
        </div>

        {/* Result Card */}
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-sm">
          <div className="p-8 text-center">
            {isSuccess ? (
              // 결제 성공
              <>
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    className="h-10 w-10 text-forest"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-forest">결제 완료!</h2>
                <p className="mt-3 text-sm text-slate">
                  결제가 성공적으로 완료되었습니다.
                  <br />
                  수강 등록 처리는 담당 직원이 확인 후 진행합니다.
                </p>
                {paymentId && (
                  <div className="mt-4 rounded-xl border border-ink/10 bg-mist/60 px-4 py-3">
                    <p className="text-xs text-slate">결제 주문번호</p>
                    <p className="mt-1 font-mono text-sm font-medium text-ink">
                      {paymentId}
                    </p>
                  </div>
                )}
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-medium text-amber-800">
                    수강 등록 확인 안내
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    결제 확인 후 담당자가 수강 등록을 처리합니다.
                    <br />
                    문의사항은 학원으로 연락해 주세요.
                  </p>
                </div>
              </>
            ) : isCancelled ? (
              // 결제 취소
              <>
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-ink/10">
                  <svg
                    className="h-10 w-10 text-slate"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-ink">결제 취소</h2>
                <p className="mt-3 text-sm text-slate">
                  결제가 취소되었습니다.
                </p>
                {message && (
                  <p className="mt-2 text-xs text-slate">{message}</p>
                )}
              </>
            ) : (
              // 결제 오류
              <>
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-10 w-10 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-red-700">결제 실패</h2>
                <p className="mt-3 text-sm text-slate">
                  결제 처리 중 오류가 발생했습니다.
                </p>
                {code && (
                  <p className="mt-1 text-xs text-slate">
                    오류 코드: {code}
                  </p>
                )}
                {message && (
                  <p className="mt-1 text-xs text-red-600">{message}</p>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="border-t border-ink/5 px-6 pb-6 pt-4">
            {isSuccess ? (
              <div className="space-y-3">
                {branding.phoneHref ? (
                  <a
                    href={branding.phoneHref}
                    className="block w-full rounded-full border border-ink/15 px-5 py-3 text-center text-sm font-medium text-ink transition hover:border-ink/30"
                  >
                    {branding.phone} 문의하기
                  </a>
                ) : null}
              </div>
            ) : (
              // 취소 또는 오류 → 재결제 버튼
              <div className="space-y-3">
                <Link
                  href={`/pay/${token}`}
                  className="block w-full rounded-full bg-ember px-5 py-3.5 text-center text-base font-semibold text-white transition hover:bg-ember/90 active:scale-95"
                >
                  다시 결제하기
                </Link>
                {branding.phoneHref ? (
                  <a
                    href={branding.phoneHref}
                    className="block w-full rounded-full border border-ink/15 px-5 py-3 text-center text-sm font-medium text-ink transition hover:border-ink/30"
                  >
                    {branding.phone} 전화 문의
                  </a>
                ) : null}
              </div>
            )}
          </div>
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
