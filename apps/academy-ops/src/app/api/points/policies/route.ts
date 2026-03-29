import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const policies = await getPrisma().pointPolicy.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ policies });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, description, defaultAmount, isActive } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "제도명을 입력해주세요." }, { status: 400 });
    }
    if (defaultAmount === undefined || defaultAmount === null || isNaN(Number(defaultAmount))) {
      return NextResponse.json({ error: "기본 지급량을 입력해주세요." }, { status: 400 });
    }

    const policy = await getPrisma().pointPolicy.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        defaultAmount: Number(defaultAmount),
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
