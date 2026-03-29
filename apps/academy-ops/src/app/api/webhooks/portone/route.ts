/**
 * PortOne v2 웹훅 핸들러
 *
 * PortOne 서버에서 결제 이벤트가 발생하면 이 엔드포인트로 POST 요청이 옵니다.
 * 결제 완료(Transaction.Paid) 시:
 *  1. 웹훅 서명 검증 (PORTONE_WEBHOOK_SECRET 설정 시)
 *  2. PortOne API로 결제 검증
 *  3. PaymentLink 조회 (customData = linkId)
 *  4. Payment 레코드 생성 (examNumber 포함)
 *  5. PaymentLink.usageCount 증가 및 상태 업데이트
 *  6. 자동 수강등록 (PaymentLink에 examNumber + cohortId 또는 specialLectureId 설정 시)
 *  7. 카카오 알림톡 발송 (fire-and-forget)
 *
 * 참고: https://developers.portone.io/docs/ko/v2-payment/webhook
 */

import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPortOnePayment } from "@/lib/portone";
import { sendEventNotification } from "@/lib/notifications/event-notify";

// 웹훅 처리 시 사용하는 시스템 관리자 UUID
// 온라인 결제는 관리자 없이 자동으로 처리되므로 SUPER_ADMIN ID를 사용
// 환경변수 PORTONE_SYSTEM_ADMIN_UUID 로 재정의 가능
function getSystemAdminId(): string {
  return (
    process.env.PORTONE_SYSTEM_ADMIN_UUID ??
    "38c72c4c-3d8e-4082-a881-74b8fd43f1ed"
  );
}

/**
 * PortOne v2 웹훅 서명 검증
 * 서명 형식: "t={timestamp},v1={signature}" (쉼표로 구분된 여러 값)
 * 검증 방법: HMAC-SHA256(secret, timestamp + "." + rawBody)
 */
function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  // 헤더에서 timestamp와 v1 추출
  // 형식 예: "t=1714000000,v1=abcdef1234..."
  const parts = signatureHeader.split(",");
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  // 재전송 공격 방지: 타임스탬프가 5분 이내인지 확인
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    console.warn(
      `[PortOne Webhook] 타임스탬프 범위 초과: ts=${ts}, now=${now}`
    );
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return signatures.some((sig) => sig === expected);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.PORTONE_WEBHOOK_SECRET;

  let rawBody: string;
  let body: unknown;

  // 웹훅 서명 검증이 설정된 경우
  if (webhookSecret) {
    // rawBody를 먼저 읽어야 서명 검증에 사용할 수 있음
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
    }

    const signatureHeader =
      req.headers.get("webhook-signature") ??
      req.headers.get("x-portone-signature");

    if (!signatureHeader) {
      console.error("[PortOne Webhook] 서명 헤더 없음");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    if (!verifyWebhookSignature(webhookSecret, rawBody, signatureHeader)) {
      console.error("[PortOne Webhook] 서명 검증 실패");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  } else {
    // 서명 검증 없이 처리 (개발/스테이징 환경)
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const payload = body as {
    type?: string;
    data?: { paymentId?: string; storeId?: string; transactionId?: string };
  };

  // Transaction.Paid 이외의 이벤트는 즉시 200으로 응답 (무시)
  if (payload?.type !== "Transaction.Paid") {
    return NextResponse.json({ ok: true });
  }

  const portonePaymentId = payload?.data?.paymentId;
  if (!portonePaymentId) {
    console.error("[PortOne Webhook] paymentId 없음:", body);
    return NextResponse.json({ error: "paymentId missing" }, { status: 400 });
  }

  try {
    // 1. PortOne API로 결제 검증
    const verified = await verifyPortOnePayment(portonePaymentId);

    if (verified.status !== "PAID") {
      console.warn(
        `[PortOne Webhook] 결제 상태가 PAID가 아님: ${verified.status} (paymentId: ${portonePaymentId})`
      );
      // 상태 불일치 시에도 200 응답 (PortOne 재시도 방지)
      return NextResponse.json({ ok: true });
    }

    // 2. customData에서 linkId + 포인트 정보 추출
    // 신규 형식: JSON { linkId, pointAmount?, examNumber? }
    // 구 형식(하위 호환): 숫자 문자열 "123"
    const customDataStr = verified.customData;
    if (!customDataStr) {
      console.error(
        `[PortOne Webhook] customData(linkId) 없음 (paymentId: ${portonePaymentId})`
      );
      return NextResponse.json({ error: "customData missing" }, { status: 400 });
    }

    let linkId: number;
    let webhookPointAmount = 0;
    let webhookExamNumber: string | null = null;

    // JSON 파싱 시도 (신규 형식)
    if (customDataStr.startsWith("{")) {
      let parsed: { linkId?: unknown; pointAmount?: unknown; examNumber?: unknown };
      try {
        parsed = JSON.parse(customDataStr) as { linkId?: unknown; pointAmount?: unknown; examNumber?: unknown };
      } catch {
        console.error(
          `[PortOne Webhook] customData JSON 파싱 실패: ${customDataStr}`
        );
        return NextResponse.json({ error: "invalid customData" }, { status: 400 });
      }
      const parsedLinkId = parseInt(String(parsed.linkId ?? ""), 10);
      if (isNaN(parsedLinkId)) {
        console.error(
          `[PortOne Webhook] customData.linkId가 유효하지 않음: ${customDataStr}`
        );
        return NextResponse.json({ error: "invalid customData" }, { status: 400 });
      }
      linkId = parsedLinkId;
      if (typeof parsed.pointAmount === "number" && parsed.pointAmount > 0) {
        webhookPointAmount = parsed.pointAmount;
      }
      if (typeof parsed.examNumber === "string" && parsed.examNumber.trim()) {
        webhookExamNumber = parsed.examNumber.trim();
      }
    } else {
      // 구 형식: 순수 숫자 문자열
      const parsedLinkId = parseInt(customDataStr, 10);
      if (isNaN(parsedLinkId)) {
        console.error(
          `[PortOne Webhook] customData가 숫자가 아님: ${customDataStr}`
        );
        return NextResponse.json({ error: "invalid customData" }, { status: 400 });
      }
      linkId = parsedLinkId;
    }

    // 3. 멱등성 체크: 이미 해당 portone paymentId로 처리된 Payment가 있으면 skip
    const idempotencyKey = `portone:${portonePaymentId}`;
    const existing = await getPrisma().payment.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      console.log(
        `[PortOne Webhook] 이미 처리된 결제 (idempotencyKey: ${idempotencyKey})`
      );
      return NextResponse.json({ ok: true });
    }

    // 4. PaymentLink 조회 (자동 수강등록 관련 필드 포함)
    const link = await getPrisma().paymentLink.findUnique({
      where: { id: linkId },
      include: {
        cohort: { select: { startDate: true, endDate: true, name: true } },
        specialLecture: { select: { startDate: true, endDate: true, name: true } },
        product: { select: { name: true } },
      },
    });

    if (!link) {
      console.error(
        `[PortOne Webhook] PaymentLink 없음 (linkId: ${linkId})`
      );
      return NextResponse.json(
        { error: "PaymentLink not found" },
        { status: 404 }
      );
    }

    // 5. 금액 검증: 실결제금액 + 포인트차감 = 링크finalAmount 이어야 함
    const paidAmount = verified.amount.paid;
    const expectedCharge = link.finalAmount - webhookPointAmount;
    if (paidAmount !== expectedCharge) {
      console.error(
        `[PortOne Webhook] 금액 불일치: paid=${paidAmount}, expected=${expectedCharge} (finalAmount=${link.finalAmount}, pointAmount=${webhookPointAmount}, linkId: ${linkId})`
      );
      // 금액 불일치는 보안 이슈이므로 400 응답 (PortOne이 재시도하지 않도록)
      return NextResponse.json({ error: "amount mismatch" }, { status: 400 });
    }

    // 포인트 사용 시 학생 존재 및 잔액 검증
    if (webhookPointAmount > 0 && webhookExamNumber) {
      const pointStudent = await getPrisma().student.findUnique({
        where: { examNumber: webhookExamNumber },
        select: { examNumber: true },
      });
      if (!pointStudent) {
        console.error(
          `[PortOne Webhook] 포인트 사용 학생 없음 (examNumber: ${webhookExamNumber})`
        );
        // 학생 없으면 포인트 미차감으로 계속 진행 (결제 자체는 정상)
        webhookPointAmount = 0;
        webhookExamNumber = null;
      } else {
        // 잔액 재확인 (조작 방지)
        const balanceAgg = await getPrisma().pointLog.aggregate({
          where: { examNumber: webhookExamNumber },
          _sum: { amount: true },
        });
        const currentBalance = Math.max(0, balanceAgg._sum.amount ?? 0);
        if (currentBalance < webhookPointAmount) {
          console.error(
            `[PortOne Webhook] 포인트 잔액 부족: balance=${currentBalance}, requested=${webhookPointAmount} (examNumber: ${webhookExamNumber})`
          );
          webhookPointAmount = 0;
          webhookExamNumber = null;
        }
      }
    }

    const systemAdminId = getSystemAdminId();

    // 6. 트랜잭션으로 Payment 생성 + PaymentLink 업데이트 + (포인트 차감)
    const { payment, updatedLink } = await getPrisma().$transaction(
      async (tx) => {
        // Payment 레코드 생성
        // examNumber는 PaymentLink에 지정된 학생 학번 또는 포인트 사용 학번을 사용
        const paymentExamNumber =
          link.examNumber ?? webhookExamNumber ?? null;

        // netAmount = 실제 카드 청구액 (paidAmount) + 포인트 차감액
        // grossAmount = 링크 정상 결제 금액 (할인 전)
        const created = await tx.payment.create({
          data: {
            idempotencyKey,
            examNumber: paymentExamNumber,
            paymentLinkId: link.id,
            category: "TUITION",
            method: "CARD",
            status: "APPROVED",
            grossAmount: link.amount,
            discountAmount: link.discountAmount,
            couponAmount: 0,
            pointAmount: webhookPointAmount,
            netAmount: link.finalAmount, // 포인트 포함 총 결제 가치 (link.finalAmount)
            note: `PortOne 온라인 결제 | 주문ID: ${portonePaymentId}${verified.orderName ? ` | ${verified.orderName}` : ""}${webhookPointAmount > 0 ? ` | 포인트 ${webhookPointAmount.toLocaleString()}P 사용` : ""}`,
            processedBy: systemAdminId,
            processedAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
          },
        });

        // 포인트 차감 PointLog 생성
        if (webhookPointAmount > 0 && webhookExamNumber) {
          await tx.pointLog.create({
            data: {
              examNumber: webhookExamNumber,
              type: "MANUAL",
              amount: -webhookPointAmount,
              reason: `온라인 결제 포인트 사용 | 결제ID: ${created.id}`,
              grantedBy: systemAdminId,
            },
          });
        }

        // PaymentLink usageCount 증가
        const newUsageCount = link.usageCount + 1;
        const isUsedUp =
          link.maxUsage != null && newUsageCount >= link.maxUsage;

        const updated = await tx.paymentLink.update({
          where: { id: link.id },
          data: {
            usageCount: newUsageCount,
            ...(isUsedUp ? { status: "USED_UP" } : {}),
          },
        });

        return { payment: created, updatedLink: updated };
      }
    );

    console.log(
      `[PortOne Webhook] 결제 처리 완료 - paymentId: ${payment.id}, linkId: ${linkId}, usageCount: ${updatedLink.usageCount}`
    );

    // 7. 자동 수강등록: PaymentLink에 examNumber와 courseType 및 기수/특강 정보가 있을 때
    let enrollmentCreated = false;
    let enrollmentId: string | null = null;

    if (link.examNumber && link.courseType) {
      try {
        const canAutoEnroll =
          (link.courseType === "COMPREHENSIVE" && link.cohortId) ||
          (link.courseType === "SPECIAL_LECTURE" && link.specialLectureId);

        if (canAutoEnroll) {
          // 이미 동일 학생+기수/특강 조합으로 수강중인지 확인 (중복 방지)
          const existingEnrollment = await getPrisma().courseEnrollment.findFirst({
            where: {
              examNumber: link.examNumber,
              courseType: link.courseType,
              status: { in: ["PENDING", "ACTIVE", "WAITING"] },
              ...(link.cohortId ? { cohortId: link.cohortId } : {}),
              ...(link.specialLectureId
                ? { specialLectureId: link.specialLectureId }
                : {}),
            },
          });

          if (existingEnrollment) {
            console.log(
              `[PortOne Webhook] 이미 수강 중인 학생 — 자동 수강등록 건너뜀 (examNumber: ${link.examNumber}, enrollmentId: ${existingEnrollment.id})`
            );
            enrollmentId = existingEnrollment.id;
          } else {
            // 기수 또는 특강에서 날짜 정보 가져오기
            const startDate =
              link.cohort?.startDate ??
              link.specialLecture?.startDate ??
              new Date();
            const endDate =
              link.cohort?.endDate ?? link.specialLecture?.endDate ?? null;

            // 정원 확인 (종합반 기수인 경우)
            let enrollmentStatus: "ACTIVE" | "WAITING" = "ACTIVE";
            let waitlistOrder: number | null = null;

            if (link.cohortId && link.cohort) {
              const cohortFull = await getPrisma().cohort.findUnique({
                where: { id: link.cohortId },
              });
              if (cohortFull?.maxCapacity) {
                const activeCount = await getPrisma().courseEnrollment.count({
                  where: {
                    cohortId: link.cohortId,
                    status: { in: ["PENDING", "ACTIVE"] },
                  },
                });
                if (activeCount >= cohortFull.maxCapacity) {
                  const maxWait =
                    await getPrisma().courseEnrollment.aggregate({
                      where: { cohortId: link.cohortId, status: "WAITING" },
                      _max: { waitlistOrder: true },
                    });
                  enrollmentStatus = "WAITING";
                  waitlistOrder =
                    (maxWait._max.waitlistOrder ?? 0) + 1;
                }
              }
            }

            const newEnrollment = await getPrisma().courseEnrollment.create({
              data: {
                examNumber: link.examNumber,
                courseType: link.courseType,
                cohortId: link.cohortId ?? null,
                productId: link.productId ?? null,
                specialLectureId: link.specialLectureId ?? null,
                startDate,
                endDate,
                regularFee: link.amount,
                discountAmount: link.discountAmount,
                finalFee: link.finalAmount,
                status: enrollmentStatus,
                waitlistOrder,
                enrollSource: "ONLINE",
                staffId: systemAdminId,
                isRe: false,
                extraData: {
                  autoEnrolled: true,
                  paymentId: payment.id,
                  paymentLinkId: link.id,
                  portonePaymentId,
                },
              },
            });

            enrollmentCreated = true;
            enrollmentId = newEnrollment.id;

            console.log(
              `[PortOne Webhook] 자동 수강등록 완료 - enrollmentId: ${newEnrollment.id}, examNumber: ${link.examNumber}, status: ${enrollmentStatus}`
            );
          }
        }
      } catch (enrollErr) {
        // 수강등록 실패는 결제 응답에 영향을 주지 않음 (fire-and-forget 방식)
        console.error(
          "[PortOne Webhook] 자동 수강등록 실패 (결제는 정상 처리됨):",
          enrollErr
        );
      }
    }

    // 8. 알림톡 발송 (fire-and-forget)
    if (link.examNumber) {
      // 수납 완료 알림
      void sendEventNotification({
        examNumber: link.examNumber,
        type: "PAYMENT_COMPLETE",
        messageInput: {
          studentName: "", // sendEventNotification에서 DB 조회
          paymentAmount: paidAmount.toLocaleString("ko-KR"),
          paymentMethod: "카드",
        },
        dedupeKey: `payment_complete:${payment.id}`,
      }).catch((err) =>
        console.error("[PortOne Webhook] 수납 알림 발송 실패:", err)
      );

      // 자동 수강등록이 신규로 완료된 경우 — 수강 등록 완료 알림 추가 발송
      if (enrollmentCreated) {
        const courseName =
          link.cohort?.name ??
          link.specialLecture?.name ??
          link.product?.name ??
          link.title;

        const cohortOrLecture = link.cohort ?? link.specialLecture ?? null;
        const enrollmentPeriod = cohortOrLecture
          ? `${cohortOrLecture.startDate.toLocaleDateString("ko-KR")} ~ ${cohortOrLecture.endDate.toLocaleDateString("ko-KR")}`
          : "";

        void sendEventNotification({
          examNumber: link.examNumber,
          type: "ENROLLMENT_COMPLETE",
          messageInput: {
            studentName: "", // sendEventNotification에서 DB 조회
            courseName,
            enrollmentPeriod,
          },
          dedupeKey: `enrollment_complete:${enrollmentId}`,
        }).catch((err) =>
          console.error("[PortOne Webhook] 수강등록 알림 발송 실패:", err)
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PortOne Webhook] 처리 중 오류:", err);

    // PortOne은 2xx가 아닌 경우 재시도하므로, 처리 가능한 오류는 200으로 응답
    // 그러나 내부 오류는 500으로 반환하여 PortOne이 재시도하도록 함
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
