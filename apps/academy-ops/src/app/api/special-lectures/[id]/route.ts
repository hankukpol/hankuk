import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const lecture = await getPrisma().specialLecture.findUnique({
    where: { id: params.id },
    include: {
      subjects: {
        include: { instructor: { select: { id: true, name: true, subject: true } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
        },
      },
    },
  });

  if (!lecture) return NextResponse.json({ error: "강좌를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ lecture });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.lectureType !== undefined) data.lectureType = body.lectureType;
    if (body.examCategory !== undefined) data.examCategory = body.examCategory || null;
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
    if (body.isMultiSubject !== undefined) data.isMultiSubject = !!body.isMultiSubject;
    if (body.fullPackagePrice !== undefined) data.fullPackagePrice = body.fullPackagePrice ? Number(body.fullPackagePrice) : null;
    if (body.hasSeatAssignment !== undefined) data.hasSeatAssignment = !!body.hasSeatAssignment;
    if (body.hasLive !== undefined) data.hasLive = !!body.hasLive;
    if (body.hasOffline !== undefined) data.hasOffline = !!body.hasOffline;
    if (body.maxCapacityLive !== undefined) data.maxCapacityLive = body.maxCapacityLive ? Number(body.maxCapacityLive) : null;
    if (body.maxCapacityOffline !== undefined) data.maxCapacityOffline = body.maxCapacityOffline ? Number(body.maxCapacityOffline) : null;
    if (body.waitlistAllowed !== undefined) data.waitlistAllowed = !!body.waitlistAllowed;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const lecture = await getPrisma().specialLecture.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ lecture });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const count = await getPrisma().courseEnrollment.count({
      where: { specialLectureId: params.id, status: { notIn: ["CANCELLED", "WITHDRAWN"] } },
    });
    if (count > 0) {
      return NextResponse.json(
        { error: `수강 중인 학생(${count}명)이 있어 삭제할 수 없습니다. 먼저 비활성화 하세요.` },
        { status: 409 },
      );
    }

    await getPrisma().specialLecture.delete({ where: { id: params.id } });
    return NextResponse.json({ id: params.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
