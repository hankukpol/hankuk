import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { adminAccountCreateSchema } from "@/lib/super-admin-schemas";
import {
  createManagedAdminAccount,
  listManagedAdminAccounts,
} from "@/lib/services/super-admin.service";

export async function GET() {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const admins = await listManagedAdminAccounts();
    return NextResponse.json({ admins }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "계정 목록을 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminAccountCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "계정 입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const admin = await createManagedAdminAccount(parsed.data);
    return NextResponse.json({ admin }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "계정 생성에 실패했습니다." },
      { status: 400 },
    );
  }
}
