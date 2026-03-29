import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const instructor = await getPrisma().instructor.findUnique({
    where: { id: params.id },
  });

  if (!instructor) {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ instructor });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, subject, phone, email, bankName, bankAccount, bankHolder, isActive } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (subject !== undefined) data.subject = subject.trim();
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (email !== undefined) data.email = email?.trim() || null;
    if (bankName !== undefined) data.bankName = bankName?.trim() || null;
    if (bankAccount !== undefined) data.bankAccount = bankAccount?.trim() || null;
    if (bankHolder !== undefined) data.bankHolder = bankHolder?.trim() || null;
    if (isActive !== undefined) data.isActive = isActive;

    const instructor = await getPrisma().instructor.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ instructor });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
