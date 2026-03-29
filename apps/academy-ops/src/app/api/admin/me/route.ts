import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const context = await getCurrentAdminContext();

  if (!context) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: context.adminUser.id,
      email: context.adminUser.email,
      name: context.adminUser.name,
      role: context.adminUser.role,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const context = await getCurrentAdminContext();

  if (!context) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { name } = body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 올바르게 입력해 주세요." }, { status: 400 });
  }

  const trimmedName = name.trim();

  if (trimmedName.length > 50) {
    return NextResponse.json({ error: "이름은 50자 이내로 입력해 주세요." }, { status: 400 });
  }

  const prisma = getPrisma();

  const updated = await prisma.adminUser.update({
    where: { id: context.adminUser.id },
    data: { name: trimmedName },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}
