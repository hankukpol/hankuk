import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(90, parseInt(searchParams.get("days") ?? "14", 10) || 14));
    const statusParam = (searchParams.get("status") ?? "ACTIVE") as EnrollmentStatus;

    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const cutoff7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const cutoff14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const cutoff30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const prisma = getPrisma();

    const [enrollments, within7days, within14days, within30days] = await Promise.all([
      prisma.courseEnrollment.findMany({
        where: {
          status: statusParam,
          endDate: {
            gte: now,
            lte: cutoff,
          },
        },
        include: {
          student: {
            select: {
              name: true,
              examNumber: true,
              phone: true,
            },
          },
          cohort: {
            select: {
              name: true,
              examCategory: true,
            },
          },
          product: {
            select: {
              name: true,
            },
          },
          specialLecture: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { endDate: "asc" },
      }),
      prisma.courseEnrollment.count({
        where: {
          status: statusParam,
          endDate: { gte: now, lte: cutoff7 },
        },
      }),
      prisma.courseEnrollment.count({
        where: {
          status: statusParam,
          endDate: { gte: now, lte: cutoff14 },
        },
      }),
      prisma.courseEnrollment.count({
        where: {
          status: statusParam,
          endDate: { gte: now, lte: cutoff30 },
        },
      }),
    ]);

    return NextResponse.json({
      data: {
        enrollments,
        counts: { within7days, within14days, within30days },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
