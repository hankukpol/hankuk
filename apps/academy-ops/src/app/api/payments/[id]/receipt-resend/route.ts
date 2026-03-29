import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { resolveVisibleAcademyId } from "@/lib/academy-scope";
import { resendPaymentReceiptNotification } from "@/lib/notifications/payment-receipts";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;

  try {
    const result = await resendPaymentReceiptNotification({
      paymentId: id,
      academyId: resolveVisibleAcademyId(auth.context),
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({
      data: {
        paymentId: result.paymentId,
        receiptNo: result.receiptNo,
        deliveries: result.deliveries,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "영수증 재발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
