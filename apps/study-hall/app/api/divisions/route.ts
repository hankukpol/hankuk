import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { divisionCreateSchema } from "@/lib/super-admin-schemas";
import {
  createManagedDivision,
  listManagedDivisions,
} from "@/lib/services/super-admin.service";

export async function GET() {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const divisions = await listManagedDivisions();
  return NextResponse.json({ divisions }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = divisionCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "지점 입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const division = await createManagedDivision(parsed.data);
    return NextResponse.json({ division }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "지점 생성에 실패했습니다." },
      { status: 400 },
    );
  }
}
