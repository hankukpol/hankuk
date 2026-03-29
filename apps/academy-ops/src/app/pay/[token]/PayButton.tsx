"use client";

/**
 * PortOne v2 브라우저 SDK를 이용한 결제 버튼 클라이언트 컴포넌트
 *
 * PortOne 브라우저 SDK는 CDN 스크립트로 동적 로드합니다.
 * https://developers.portone.io/docs/ko/v2-payment/v2
 */

import { useCallback, useEffect, useRef, useState } from "react";

// PortOne 브라우저 SDK 타입 선언
interface PortOneRequestPaymentOptions {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: string;
  payMethod: string;
  customData?: string;
  redirectUrl?: string;
  customer?: {
    fullName?: string;
    phoneNumber?: string;
    email?: string;
  };
}

interface PortOnePaymentResponse {
  code?: string;
  message?: string;
  paymentId?: string;
  txId?: string;
}

interface PortOneBrowserSDK {
  requestPayment(
    options: PortOneRequestPaymentOptions
  ): Promise<PortOnePaymentResponse>;
}

declare global {
  interface Window {
    PortOne?: PortOneBrowserSDK;
  }
}

type PayButtonProps = {
  linkId: number;
  token: string;
  orderName: string;
  finalAmount: number;
  /** 포인트 차감 금액 (0이면 포인트 미사용) */
  pointAmount?: number;
  /** 포인트 사용 학생 학번 */
  examNumber?: string;
  contactPhone: string | null;
  contactPhoneHref: string | null;
};

export function PayButton({
  linkId,
  token,
  orderName,
  finalAmount,
  pointAmount = 0,
  examNumber,
  contactPhone,
  contactPhoneHref,
}: PayButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  // PortOne 브라우저 SDK CDN 동적 로드
  useEffect(() => {
    if (window.PortOne) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.portone.io/v2/browser-sdk.js";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () =>
      setError("결제 모듈 로드에 실패했습니다. 페이지를 새로고침 해주세요.");
    document.head.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (scriptRef.current && document.head.contains(scriptRef.current)) {
        document.head.removeChild(scriptRef.current);
      }
    };
  }, []);

  const handlePayment = useCallback(async () => {
    if (!window.PortOne) {
      setError("결제 모듈이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

    if (!storeId || !channelKey) {
      setError("결제 설정이 올바르지 않습니다. 학원에 문의해 주세요.");
      console.error("[PortOne] NEXT_PUBLIC_PORTONE_STORE_ID 또는 NEXT_PUBLIC_PORTONE_CHANNEL_KEY 미설정");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const paymentId = `PL-${linkId}-${Date.now()}`;
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";

      // 포인트 차감 시 실제 청구 금액을 줄이고, customData에 linkId + 포인트 정보를 JSON으로 전달
      const chargeAmount = pointAmount > 0 ? finalAmount - pointAmount : finalAmount;
      const customData = JSON.stringify(
        pointAmount > 0 && examNumber
          ? { linkId, pointAmount, examNumber }
          : { linkId }
      );

      const response = await window.PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName,
        totalAmount: chargeAmount,
        currency: "KRW",
        payMethod: "CARD",
        customData, // 웹훅에서 linkId + 포인트 정보 추출에 사용
        redirectUrl: `${origin}/pay/${token}/result`,
      });

      // 리다이렉트 방식 결제 시 이 코드에 도달하지 않을 수 있음
      // 팝업 방식 결제 응답 처리
      if (response?.code) {
        // 결제 실패 또는 취소
        setError(
          response.message
            ? `결제가 취소되었습니다: ${response.message}`
            : "결제가 취소되었습니다."
        );
      } else if (response?.paymentId) {
        // 팝업 결제 성공 → result 페이지로 이동
        window.location.href = `/pay/${token}/result?paymentId=${response.paymentId}`;
      }
    } catch (err) {
      console.error("[PortOne] 결제 오류:", err);
      setError(
        err instanceof Error
          ? err.message
          : "결제 중 오류가 발생했습니다. 다시 시도해 주세요."
      );
    } finally {
      setIsLoading(false);
    }
  }, [linkId, token, orderName, finalAmount, pointAmount, examNumber]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={handlePayment}
        disabled={isLoading || !sdkReady}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-ember px-5 py-3.5 text-base font-semibold text-white transition hover:bg-ember/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            결제 진행 중...
          </>
        ) : !sdkReady ? (
          "결제 모듈 로딩 중..."
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            카드 결제하기
          </>
        )}
      </button>

      <a
        href={contactPhoneHref ?? undefined}
        className="block w-full rounded-full border border-ink/15 px-5 py-3 text-center text-sm font-medium text-ink transition hover:border-ink/30"
      >
        {contactPhone ?? "\uD559\uC6D0 \uBB38\uC758"} \uC804\uD654 \uBB38\uC758
      </a>
    </div>
  );
}
