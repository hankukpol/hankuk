import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// POST /api/payment-links/bulk
// Body: { examNumbers: string[], amount: number, note?: string, expiresAt: string, courseId?: number, title: string, discountAmount?: number, allowPoint?: boolean }
// Returns: { created: number, skipped: number, links: PaymentLink[] }

export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json() as {
    examNumbers: string[];
    title: string;
    amount: number;
    discountAmount?: number;
    allowPoint?: boolean;
    expiresAt: string;
    courseId?: number;
    note?: string;
  };

  const {
    examNumbers,
    title,
    amount,
    discountAmount = 0,
    allowPoint = true,
    expiresAt,
    courseId,
    note,
  } = body;

  // Validation
  if (!Array.isArray(examNumbers) || examNumbers.length === 0) {
    return NextResponse.json({ error: "학번 목록을 입력해 주세요." }, { status: 400 });
  }
  if (!title?.trim()) {
    return NextResponse.json({ error: "링크 제목을 입력해 주세요." }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력해 주세요." }, { status: 400 });
  }
  if (!expiresAt) {
    return NextResponse.json({ error: "만료일을 입력해 주세요." }, { status: 400 });
  }
  if (examNumbers.length > 200) {
    return NextResponse.json({ error: "한 번에 최대 200명까지 생성할 수 있습니다." }, { status: 400 });
  }

  const db = getPrisma();
  const finalAmount = Math.max(0, amount - (discountAmount ?? 0));
  const expiresAtDate = new Date(expiresAt);

  // Fetch existing students
  const dedupedExamNumbers = [...new Set(examNumbers.map((n) => n.trim()).filter(Boolean))];

  const existingStudents = await db.student.findMany({
    where: { examNumber: { in: dedupedExamNumbers } },
    select: { examNumber: true, name: true },
  });

  const existingSet = new Set(existingStudents.map((s) => s.examNumber));
  const skippedNumbers = dedupedExamNumbers.filter((n) => !existingSet.has(n));

  const toCreate = dedupedExamNumbers.filter((n) => existingSet.has(n));

  // Create links in a transaction
  const createdLinks = await db.$transaction(
    toCreate.map((examNumber) =>
      db.paymentLink.create({
        data: {
          title: title.trim(),
          courseId: courseId ?? null,
          examNumber,
          amount,
          discountAmount: discountAmount ?? 0,
          finalAmount,
          allowPoint: allowPoint ?? true,
          expiresAt: expiresAtDate,
          note: note?.trim() ?? null,
          createdBy: auth.context.adminUser.id,
        },
        select: {
          id: true,
          token: true,
          title: true,
          examNumber: true,
          amount: true,
          discountAmount: true,
          finalAmount: true,
          expiresAt: true,
          status: true,
          createdAt: true,
        },
      }),
    ),
  );

  const serializedLinks = createdLinks.map((l) => ({
    ...l,
    expiresAt: l.expiresAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    studentName: existingStudents.find((s) => s.examNumber === l.examNumber)?.name ?? null,
  }));

  return NextResponse.json(
    {
      created: createdLinks.length,
      skipped: skippedNumbers.length,
      skippedNumbers,
      links: serializedLinks,
    },
    { status: 201 },
  );
}
