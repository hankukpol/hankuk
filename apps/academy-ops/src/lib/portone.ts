/**
 * PortOne v2 서버 사이드 결제 검증 유틸리티
 *
 * @portone/server-sdk 를 사용해 결제 건을 조회·검증합니다.
 * 환경변수 PORTONE_API_SECRET 이 설정되어 있어야 합니다.
 */
import { PortOneClient } from "@portone/server-sdk";
import type { Payment } from "@portone/server-sdk/payment";

export type PortOnePaymentResult = {
  status: string; // "PAID" | "FAILED" | "CANCELLED" | "VIRTUAL_ACCOUNT_ISSUED" | ...
  paymentId: string; // 고객사 채번 주문 ID (우리가 보낸 paymentId)
  amount: {
    total: number; // 총 결제 금액
    paid: number; // 실제 결제 금액
  };
  customData?: string; // 우리가 보낸 customData (linkId)
  paidAt?: string; // 결제 완료 시점 (RFC 3339)
  orderName?: string;
  method?: string; // 결제 수단 type 문자열
};

function getPortOneClient() {
  const secret = process.env.PORTONE_API_SECRET;
  if (!secret) {
    throw new Error("PORTONE_API_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return PortOneClient({ secret });
}

/**
 * SDK Payment 유니온 타입에서 공통 필드를 안전하게 추출합니다.
 * `{ readonly status: Unrecognized }` 케이스는 `id` 필드가 없으므로 별도 처리합니다.
 */
function extractPaymentFields(payment: Payment): PortOnePaymentResult {
  // Unrecognized 케이스 처리: status가 string이 아닌 Symbol
  if (typeof payment.status !== "string") {
    return {
      status: "UNKNOWN",
      paymentId: "",
      amount: { total: 0, paid: 0 },
    };
  }

  // 이 시점부터 payment는 PaidPayment | FailedPayment | CancelledPayment 등
  // TypeScript 유니온에서 공통 필드를 안전하게 접근
  const p = payment as Extract<Payment, { status: string }>;

  // amount 추출 (일부 상태에는 amount 없음)
  let totalAmount = 0;
  let paidAmount = 0;
  if ("amount" in p && p.amount != null) {
    const amt = p.amount as { total?: number; paid?: number };
    totalAmount = amt.total ?? 0;
    paidAmount = amt.paid ?? 0;
  }

  // customData 추출
  let customData: string | undefined;
  if ("customData" in p && typeof p.customData === "string") {
    customData = p.customData;
  }

  // paidAt 추출 (PAID 상태인 경우)
  let paidAt: string | undefined;
  if (p.status === "PAID" && "paidAt" in p && typeof p.paidAt === "string") {
    paidAt = p.paidAt;
  }

  // orderName 추출
  let orderName: string | undefined;
  if ("orderName" in p && typeof p.orderName === "string") {
    orderName = p.orderName;
  }

  // 결제 수단 type 추출
  let methodType: string | undefined;
  if ("method" in p && p.method != null) {
    const m = p.method as { type?: string };
    methodType = m.type;
  }

  return {
    status: p.status,
    paymentId: (p as { id?: string }).id ?? "",
    amount: {
      total: totalAmount,
      paid: paidAmount,
    },
    customData,
    paidAt,
    orderName,
    method: methodType,
  };
}

/**
 * PortOne v2 API로 결제 건을 조회하고 검증합니다.
 *
 * @param paymentId - 고객사에서 채번한 결제 주문 ID (PortOne paymentId)
 * @returns 결제 상태 및 금액 정보
 * @throws 결제 건 조회 실패 시 에러
 */
export async function verifyPortOnePayment(
  paymentId: string
): Promise<PortOnePaymentResult> {
  const client = getPortOneClient();
  const payment = await client.payment.getPayment({ paymentId });
  return extractPaymentFields(payment);
}
