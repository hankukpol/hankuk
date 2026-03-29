import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const TEXT = {
  notFound: "\uBD84\uD560 \uB0A9\uBD80 \uD56D\uBAA9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  readFailed: "\uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  invalidDate: "\uC62C\uBC14\uB978 \uB0A9\uBD80 \uC77C\uC2DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  alreadyPaid: "\uC774\uBBF8 \uB0A9\uBD80 \uCC98\uB9AC\uB41C \uD56D\uBAA9\uC785\uB2C8\uB2E4.",
  payFailed: "\uB0A9\uBD80 \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
} as const;

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;

    const installment = await getPrisma().installment.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            student: { select: { name: true, phone: true, examNumber: true } },
            items: { orderBy: { id: "asc" } },
            installments: { orderBy: { seq: "asc" } },
          },
        },
      },
    });

    if (!installment) {
      return NextResponse.json({ error: TEXT.notFound }, { status: 404 });
    }

    return NextResponse.json({ data: installment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.readFailed },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;

    let body: { paidAt?: string } = {};
    try {
      body = (await request.json()) as { paidAt?: string };
    } catch {
      body = {};
    }

    const paidAtDate = body.paidAt ? new Date(body.paidAt) : new Date();
    if (Number.isNaN(paidAtDate.getTime())) {
      return NextResponse.json({ error: TEXT.invalidDate }, { status: 400 });
    }

    const prisma = getPrisma();
    const existing = await prisma.installment.findUnique({
      where: { id },
      select: { id: true, paidAt: true, paymentId: true, seq: true, amount: true },
    });

    if (!existing) {
      return NextResponse.json({ error: TEXT.notFound }, { status: 404 });
    }

    if (existing.paidAt !== null) {
      return NextResponse.json({ error: TEXT.alreadyPaid }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.installment.update({
        where: { id },
        data: { paidAt: paidAtDate },
      });

      const siblings = await tx.installment.findMany({
        where: { paymentId: existing.paymentId },
        select: { id: true, paidAt: true },
      });

      const allPaid = siblings.every((sibling) => sibling.id === id || sibling.paidAt !== null);

      if (allPaid) {
        await tx.payment.update({
          where: { id: existing.paymentId },
          data: { status: "APPROVED" },
        });
      }

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "PAY_INSTALLMENT",
          targetType: "installment",
          targetId: id,
          before: { paidAt: null },
          after: {
            paymentId: existing.paymentId,
            seq: existing.seq,
            amount: existing.amount,
            paidAt: paidAtDate.toISOString(),
            allPaid,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return result;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.payFailed },
      { status: 400 },
    );
  }
}
