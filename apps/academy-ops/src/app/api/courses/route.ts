import { AdminRole, CourseCategory, CourseStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const category = sp.get("category") as CourseCategory | null;
  const status = sp.get("status") as CourseStatus | null;
  const activeOnly = sp.get("activeOnly") === "true";

  const courses = await getPrisma().course.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, category, examType, tuitionFee, description, maxCapacity, cohortStartDate, cohortEndDate } = body;

    if (!name?.trim()) throw new Error("강좌명을 입력하세요.");
    if (!category) throw new Error("강좌 분류를 선택하세요.");
    if (tuitionFee === undefined || tuitionFee === null || tuitionFee < 0)
      throw new Error("수강료를 입력하세요.");

    const course = await getPrisma().$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          name: name.trim(),
          category,
          examType: examType || null,
          tuitionFee: Number(tuitionFee),
          description: description?.trim() || null,
          maxCapacity: maxCapacity ? Number(maxCapacity) : null,
          cohortStartDate: cohortStartDate ? new Date(cohortStartDate) : null,
          cohortEndDate: cohortEndDate ? new Date(cohortEndDate) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_COURSE",
          targetType: "course",
          targetId: String(created.id),
          after: { name: created.name, category, tuitionFee },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return created;
    });

    return NextResponse.json({ course });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
