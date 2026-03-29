import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const instructors = await getPrisma().instructor.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ instructors });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, subject, phone, email, bankName, bankAccount, bankHolder } = body;

    if (!name?.trim() || !subject?.trim()) {
      return NextResponse.json({ error: "이름과 담당 과목을 입력하세요." }, { status: 400 });
    }

    const instructor = await getPrisma().instructor.create({
      data: {
        name: name.trim(),
        subject: subject.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        bankName: bankName?.trim() || null,
        bankAccount: bankAccount?.trim() || null,
        bankHolder: bankHolder?.trim() || null,
      },
    });

    return NextResponse.json({ instructor }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
