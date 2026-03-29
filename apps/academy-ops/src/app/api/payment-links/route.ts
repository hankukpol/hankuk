import { NextRequest, NextResponse } from "next/server";
import { AdminRole, CourseType } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// GET /api/payment-links - list all payment links with stats
export async function GET(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  const links = await getPrisma().paymentLink.findMany({
    where: status ? { status: status as "ACTIVE" | "EXPIRED" | "DISABLED" | "USED_UP" } : undefined,
    include: {
      staff: { select: { name: true } },
      course: { select: { name: true } },
      _count: { select: { payments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const serialized = links.map((link) => ({
    ...link,
    expiresAt: link.expiresAt.toISOString(),
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    isExpired: link.expiresAt < now,
    isExpiringSoon: link.status === "ACTIVE" && link.expiresAt > now && link.expiresAt < new Date(now.getTime() + 24 * 60 * 60 * 1000),
  }));

  // 상태별 집계 (만료 여부는 expiresAt 기준으로 실시간 판단)
  const stats = {
    total: links.length,
    active: links.filter((l) => l.status === "ACTIVE" && l.expiresAt >= now).length,
    paid: links.reduce((sum, l) => sum + l._count.payments, 0),
    expired: links.filter((l) => l.status === "EXPIRED" || (l.status === "ACTIVE" && l.expiresAt < now)).length,
    disabled: links.filter((l) => l.status === "DISABLED").length,
    usedUp: links.filter((l) => l.status === "USED_UP").length,
    expiringSoon: links.filter(
      (l) => l.status === "ACTIVE" && l.expiresAt > now && l.expiresAt < new Date(now.getTime() + 24 * 60 * 60 * 1000),
    ).length,
  };

  return NextResponse.json({ links: serialized, stats });
}

// POST /api/payment-links - create a new payment link
export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const {
    title,
    courseId,
    examNumber,
    cohortId,
    productId,
    courseType,
    specialLectureId,
    amount,
    discountAmount = 0,
    allowPoint = true,
    expiresAt,
    maxUsage,
    note,
  } = body as {
    title: string;
    courseId?: number;
    examNumber?: string;
    cohortId?: string;
    productId?: string;
    courseType?: CourseType;
    specialLectureId?: string;
    amount: number;
    discountAmount?: number;
    allowPoint?: boolean;
    expiresAt: string;
    maxUsage?: number;
    note?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력해 주세요." }, { status: 400 });
  }
  if (!expiresAt) {
    return NextResponse.json({ error: "만료일을 입력해 주세요." }, { status: 400 });
  }

  const finalAmount = Math.max(0, amount - (discountAmount ?? 0));

  const link = await getPrisma().paymentLink.create({
    data: {
      title: title.trim(),
      courseId: courseId ?? null,
      examNumber: examNumber?.trim() ?? null,
      cohortId: cohortId ?? null,
      productId: productId ?? null,
      courseType: courseType ?? null,
      specialLectureId: specialLectureId ?? null,
      amount,
      discountAmount: discountAmount ?? 0,
      finalAmount,
      allowPoint: allowPoint ?? true,
      expiresAt: new Date(expiresAt),
      maxUsage: maxUsage ?? null,
      note: note?.trim() ?? null,
      createdBy: auth.context.adminUser.id,
    },
  });

  return NextResponse.json(
    {
      link: {
        ...link,
        expiresAt: link.expiresAt.toISOString(),
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
