import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// GET /api/payment-links/[id] - get link by id (or token)
export async function GET(
  _req: NextRequest,
  context: { params: { id: string } },
) {
  // Public endpoint — also used by /pay/[token]
  const { id } = await context.params;
  const isToken = isNaN(Number(id));

  const link = await getPrisma().paymentLink.findFirst({
    where: isToken ? { token: id } : { id: Number(id) },
    include: {
      staff: { select: { name: true } },
      course: { select: { name: true, cohortStartDate: true, cohortEndDate: true } },
      payments: {
        select: {
          id: true,
          examNumber: true,
          netAmount: true,
          method: true,
          processedAt: true,
          student: { select: { name: true } },
        },
        orderBy: { processedAt: "desc" },
        take: 20,
      },
    },
  });

  if (!link) {
    return NextResponse.json({ error: "결제 링크를 찾을 수 없습니다." }, { status: 404 });
  }

  const now = new Date();

  return NextResponse.json({
    link: {
      ...link,
      expiresAt: link.expiresAt.toISOString(),
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
      isExpired: link.expiresAt < now,
      isExpiringSoon:
        link.status === "ACTIVE" &&
        link.expiresAt > now &&
        link.expiresAt < new Date(now.getTime() + 24 * 60 * 60 * 1000),
      course: link.course
        ? {
            ...link.course,
            cohortStartDate: link.course.cohortStartDate?.toISOString() ?? null,
            cohortEndDate: link.course.cohortEndDate?.toISOString() ?? null,
          }
        : null,
      payments: link.payments.map((p) => ({
        ...p,
        processedAt: p.processedAt.toISOString(),
      })),
    },
  });
}

// PATCH /api/payment-links/[id] - update (disable/cancel, change expiry, etc.)
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const numId = Number(id);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const { status, expiresAt, note } = body as {
    status?: "ACTIVE" | "DISABLED";
    expiresAt?: string;
    note?: string;
  };

  // 취소 처리 시 해당 링크가 존재하는지 확인
  const existing = await getPrisma().paymentLink.findUnique({ where: { id: numId } });
  if (!existing) {
    return NextResponse.json({ error: "결제 링크를 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 사용 완료된 링크는 상태 변경 불가 (단, note 수정은 허용)
  if (status && existing.status === "USED_UP") {
    return NextResponse.json(
      { error: "이미 사용 완료된 링크의 상태는 변경할 수 없습니다." },
      { status: 400 },
    );
  }

  const link = await getPrisma().paymentLink.update({
    where: { id: numId },
    data: {
      ...(status ? { status } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      ...(note !== undefined ? { note: note?.trim() ?? null } : {}),
    },
  });

  return NextResponse.json({
    link: {
      ...link,
      expiresAt: link.expiresAt.toISOString(),
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/payment-links/[id] - disable the link
export async function DELETE(
  _req: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const numId = Number(id);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await getPrisma().paymentLink.update({
    where: { id: numId },
    data: { status: "DISABLED" },
  });

  return NextResponse.json({ ok: true });
}
