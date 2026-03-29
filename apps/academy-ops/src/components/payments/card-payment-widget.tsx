"use client";

/**
 * CardPaymentWidget
 *
 * 관리자 수납 화면에서 카드 결제를 처리하는 클라이언트 컴포넌트.
 * PortOne v2 브라우저 SDK를 CDN으로 동적 로드하여 팝업 결제 UI를 열고,
 * 결제 완료 후 /api/payments/card-confirm으로 서버 검증을 수행합니다.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// PortOne 브라우저 SDK 타입 선언 (로컬 전용 — Window 전역 augmentation은 PayButton.tsx에만 있음)
type PortOneRequestPaymentOptions = {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: string;
  payMethod: string;
  customer?: {
    fullName?: string;
    phoneNumber?: string;
  };
};

type PortOnePaymentResponse = {
  code?: string;
  message?: string;
  paymentId?: string;
  txId?: string;
};

type PortOneBrowserSDK = {
  requestPayment(
    options: PortOneRequestPaymentOptions,
  ): Promise<PortOnePaymentResponse>;
};

// window.PortOne 접근을 위한 타입 헬퍼 (전역 augmentation 없이)
function getPortOne(): PortOneBrowserSDK | undefined {
  return (window as unknown as { PortOne?: PortOneBrowserSDK }).PortOne;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardPaymentInitData = {
  paymentId: string;
  paymentUid: string;
  amount: number;
  storeName: string;
  buyerName: string;
  buyerPhone: string;
};

type Props = {
  paymentInitData: CardPaymentInitData;
  onSuccess: (paymentId: string) => void;
  onCancel: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CardPaymentWidget({ paymentInitData, onSuccess, onCancel }: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const hasLaunched = useRef(false);

  // PortOne 브라우저 SDK CDN 동적 로드
  useEffect(() => {
    if (getPortOne()) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.portone.io/v2/browser-sdk.js";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () =>
      setErrorMessage("결제 모듈 로드에 실패했습니다. 페이지를 새로고침 해주세요.");
    document.head.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (scriptRef.current && document.head.contains(scriptRef.current)) {
        document.head.removeChild(scriptRef.current);
      }
    };
  }, []);

  // SDK 준비되면 자동으로 결제 팝업 오픈
  useEffect(() => {
    if (sdkReady && !hasLaunched.current) {
      hasLaunched.current = true;
      void handlePayment();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  const handlePayment = useCallback(async () => {
    const portone = getPortOne();
    if (!portone) {
      setErrorMessage("결제 모듈이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

    if (!storeId || !channelKey) {
      setErrorMessage("결제 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.");
      console.error(
        "[CardPaymentWidget] NEXT_PUBLIC_PORTONE_STORE_ID 또는 NEXT_PUBLIC_PORTONE_CHANNEL_KEY 미설정",
      );
      return;
    }

    setProcessing(true);
    setErrorMessage(null);

    try {
      const response = await portone.requestPayment({
        storeId,
        channelKey,
        paymentId: paymentInitData.paymentUid,
        orderName: `${paymentInitData.storeName} 카드 결제`,
        totalAmount: paymentInitData.amount,
        currency: "KRW",
        payMethod: "CARD",
        customer: {
          fullName: paymentInitData.buyerName,
          phoneNumber: paymentInitData.buyerPhone || undefined,
        },
      });

      if (response?.code) {
        // 결제 실패 또는 취소
        const msg = response.message
          ? `결제가 취소되었습니다: ${response.message}`
          : "결제가 취소되었습니다.";
        setErrorMessage(msg);
        setProcessing(false);
        return;
      }

      if (!response?.paymentId) {
        setErrorMessage("결제 응답이 올바르지 않습니다.");
        setProcessing(false);
        return;
      }

      // 서버 검증
      const confirmRes = await fetch("/api/payments/card-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentUid: paymentInitData.paymentUid,
          portonePaymentId: response.paymentId,
        }),
      });

      const confirmPayload = await confirmRes.json() as {
        data?: { paymentId: string; status: string };
        error?: string;
      };

      if (!confirmRes.ok) {
        setErrorMessage(confirmPayload.error ?? "결제 검증에 실패했습니다.");
        setProcessing(false);
        return;
      }

      if (confirmPayload.data?.status === "APPROVED") {
        onSuccess(paymentInitData.paymentId);
      } else {
        setErrorMessage("결제 승인에 실패했습니다. 다시 시도해 주세요.");
        setProcessing(false);
      }
    } catch (err) {
      console.error("[CardPaymentWidget] 결제 오류:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "결제 중 오류가 발생했습니다. 다시 시도해 주세요.",
      );
      setProcessing(false);
    }
  }, [paymentInitData, onSuccess]);

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">카드 결제</h3>
        <span className="text-sm font-bold text-forest">
          {paymentInitData.amount.toLocaleString()}원
        </span>
      </div>

      <div className="rounded-2xl bg-mist px-4 py-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate">결제자</span>
          <span className="font-medium text-ink">{paymentInitData.buyerName}</span>
        </div>
        {paymentInitData.buyerPhone ? (
          <div className="flex justify-between">
            <span className="text-slate">연락처</span>
            <span className="text-ink">{paymentInitData.buyerPhone}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-slate">주문 ID</span>
          <span className="font-mono text-xs text-slate">{paymentInitData.paymentUid}</span>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {(processing || !sdkReady) && !errorMessage ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <svg
            className="h-8 w-8 animate-spin text-ember"
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
          <p className="text-sm text-slate">
            {!sdkReady ? "결제 모듈 로딩 중..." : "결제 창 처리 중..."}
          </p>
        </div>
      ) : null}

      <div className="flex gap-3">
        {errorMessage ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              hasLaunched.current = false;
              void handlePayment();
            }}
            disabled={processing}
            className="flex-1 rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            다시 시도
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 rounded-full border border-ink/10 px-4 py-2.5 text-sm font-medium text-slate transition hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
