import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { adminPasswordResetSchema } from "@/lib/super-admin-schemas";
import { resetManagedAdminPassword } from "@/lib/services/super-admin.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminPasswordResetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "비밀번호 입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const result = await resetManagedAdminPassword(params.id, parsed.data.password);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "비밀번호 변경에 실패했습니다." },
      { status: 400 },
    );
  }
}
