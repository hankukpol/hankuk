import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 기본 키워드 (kakao-parser.ts와 동기화)
export const DEFAULT_PRESENT_KEYWORDS = [
  "동원했습니다",
  "동원",
  "출석합니다",
  "출석했습니다",
  "왔습니다",
  "자리했습니다",
  "착석했습니다",
  "공부시작",
  "시작합니다",
];

export const DEFAULT_ABSENT_KEYWORDS = [
  "결석합니다",
  "못가겠습니다",
  "결석",
  "빠지겠습니다",
];

export type AttendanceKeywordsConfig = {
  present: string[];
  absent: string[];
};

async function getAttendanceKeywords(prisma: ReturnType<typeof getPrisma>): Promise<AttendanceKeywordsConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
  if (!row) {
    return { present: DEFAULT_PRESENT_KEYWORDS, absent: DEFAULT_ABSENT_KEYWORDS };
  }
  const raw = row.data as Record<string, unknown>;
  const cfg = raw.attendanceKeywords as AttendanceKeywordsConfig | undefined;
  return {
    present: Array.isArray(cfg?.present) && cfg.present.length > 0
      ? (cfg.present as string[])
      : DEFAULT_PRESENT_KEYWORDS,
    absent: Array.isArray(cfg?.absent) && cfg.absent.length > 0
      ? (cfg.absent as string[])
      : DEFAULT_ABSENT_KEYWORDS,
  };
}

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const prisma = getPrisma();
  const keywords = await getAttendanceKeywords(prisma);
  return NextResponse.json({ data: keywords });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as AttendanceKeywordsConfig;
    const present = (body.present ?? []).map((k: string) => k.trim()).filter(Boolean);
    const absent = (body.absent ?? []).map((k: string) => k.trim()).filter(Boolean);

    if (present.length === 0) {
      return NextResponse.json({ error: "출석 키워드는 최소 1개 이상 필요합니다." }, { status: 400 });
    }
    if (absent.length === 0) {
      return NextResponse.json({ error: "결석 키워드는 최소 1개 이상 필요합니다." }, { status: 400 });
    }

    const prisma = getPrisma();

    // 현재 systemConfig 데이터를 가져와서 attendanceKeywords 필드만 업데이트
    const current = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    const currentData = (current?.data as Record<string, unknown>) ?? {};
    const merged = {
      ...currentData,
      attendanceKeywords: { present, absent },
    };

    await prisma.systemConfig.upsert({
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

    return NextResponse.json({ data: { present, absent } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { type, keyword } = await request.json() as { type: "present" | "absent"; keyword: string };
    if (!type || !keyword) {
      return NextResponse.json({ error: "type과 keyword가 필요합니다." }, { status: 400 });
    }

    const prisma = getPrisma();
    const current = await getAttendanceKeywords(prisma);
    const updated = {
      present: type === "present" ? current.present.filter((k) => k !== keyword) : current.present,
      absent: type === "absent" ? current.absent.filter((k) => k !== keyword) : current.absent,
    };

    const row = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    const currentData = (row?.data as Record<string, unknown>) ?? {};
    const merged = { ...currentData, attendanceKeywords: updated };

    await prisma.systemConfig.upsert({
      where: { id: "singleton" },
      update: { data: merged as object, updatedBy: auth.context.adminUser.id },
      create: { id: "singleton", data: merged as object, updatedBy: auth.context.adminUser.id },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
