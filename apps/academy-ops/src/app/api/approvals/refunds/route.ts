import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const refunds = await getPrisma().refund.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        payment: {
          select: {
            examNumber: true,
            student: { select: { name: true, phone: true } },
            grossAmount: true,
            netAmount: true,
            note: true,
          },
        },
      },
    });

    // Fetch requestedBy admin names separately
    const adminIds = [...new Set(refunds.map((r) => r.processedBy))];
    const admins =
      adminIds.length > 0
        ? await getPrisma().adminUser.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, name: true },
          })
        : [];
    const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

    const result = refunds.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      refundType: r.refundType,
      status: r.status,
      amount: r.amount,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      requestedByName: adminMap[r.processedBy] ?? null,
      payment: {
        examNumber: r.payment.examNumber,
        student: r.payment.student ?? null,
        grossAmount: r.payment.grossAmount,
        netAmount: r.payment.netAmount,
        note: r.payment.note,
      },
    }));

    return NextResponse.json({ data: { refunds: result, count: result.length } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
