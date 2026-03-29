import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  createAcademyWithDefaults,
  listAcademySummaries,
  parseAcademyCreateInput,
} from "@/lib/super-admin";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const academies = await listAcademySummaries();
  return NextResponse.json({ data: academies });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseAcademyCreateInput(body);
    const academy = await createAcademyWithDefaults(input, {
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ data: academy });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "지점 생성 중 오류가 발생했습니다." },
      { status: 400 },
    );
  }
}
