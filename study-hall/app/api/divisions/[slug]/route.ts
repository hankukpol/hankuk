import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { divisionUpdateSchema } from "@/lib/super-admin-schemas";
import {
  deleteManagedDivision,
  updateManagedDivision,
} from "@/lib/services/super-admin.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = divisionUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "지점 입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const division = await updateManagedDivision(params.slug, parsed.data);
    return NextResponse.json({ division });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "지점 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const deletedDivision = await deleteManagedDivision(params.slug);
    return NextResponse.json({ deletedDivision });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "지점 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
