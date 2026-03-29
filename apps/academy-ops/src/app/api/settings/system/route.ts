import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { getSystemConfig, DEFAULT_SYSTEM_CONFIG } from "@/lib/system-config";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const data = await getSystemConfig();
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const incoming = body?.data ?? body;

    // 현재 값 읽어서 병합
    const current = await getSystemConfig();
    const merged = { ...DEFAULT_SYSTEM_CONFIG, ...current, ...incoming };

    const updated = await getPrisma().systemConfig.upsert({
      where: { id: "singleton" },
      update: {
        data: merged as object,
        updatedBy: auth.context.adminUser.id,
      },
      create: {
        id: "singleton",
        data: merged as object,
        updatedBy: auth.context.adminUser.id,
      },
    });

    return NextResponse.json({ data: updated.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
