import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const lectures = await getPrisma().specialLecture.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      subjects: {
        include: { instructor: { select: { id: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
        },
      },
    },
  });

  return NextResponse.json({ lectures });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const {
      name,
      lectureType,
      examCategory,
      startDate,
      endDate,
      isMultiSubject,
      fullPackagePrice,
      hasSeatAssignment,
      hasLive,
      hasOffline,
      maxCapacityLive,
      maxCapacityOffline,
      waitlistAllowed,
    } = body;

    if (!name?.trim()) return NextResponse.json({ error: "강좌명을 입력하세요." }, { status: 400 });
    if (!lectureType) return NextResponse.json({ error: "강좌 유형을 선택하세요." }, { status: 400 });
    if (!startDate || !endDate) return NextResponse.json({ error: "시작일·종료일을 입력하세요." }, { status: 400 });

    const lecture = await getPrisma().specialLecture.create({
      data: {
        name: name.trim(),
        lectureType,
        examCategory: examCategory || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isMultiSubject: !!isMultiSubject,
        fullPackagePrice: isMultiSubject ? (fullPackagePrice ? Number(fullPackagePrice) : null) : null,
        hasSeatAssignment: !!hasSeatAssignment,
        hasLive: !!hasLive,
        hasOffline: hasOffline !== false,
        maxCapacityLive: maxCapacityLive ? Number(maxCapacityLive) : null,
        maxCapacityOffline: maxCapacityOffline ? Number(maxCapacityOffline) : null,
        waitlistAllowed: waitlistAllowed !== false,
      },
    });

    return NextResponse.json({ lecture }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
