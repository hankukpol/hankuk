import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { adminAccountUpdateSchema } from "@/lib/super-admin-schemas";
import { deleteManagedAdminAccount, updateManagedAdminAccount } from "@/lib/services/super-admin.service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await deleteManagedAdminAccount(params.id);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "계정 비활성화에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminAccountUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "계정 입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const admin = await updateManagedAdminAccount(params.id, parsed.data);
    return NextResponse.json({ admin });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "계정 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}
