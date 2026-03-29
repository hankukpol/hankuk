/**
 * POST /api/counseling/[id]/convert
 *
 * 면담 기록(CounselingRecord)의 학생을 수강 등록으로 전환합니다.
 * - CounselingRecord.id (Int) 기준으로 조회
 * - 학생(examNumber)이 이미 존재해야 합니다 (CounselingRecord는 기존 학생 전용)
 * - CourseEnrollment 생성 후 extraData에 fromCounselingRecordId 기록
 *
 * Body:
 * {
 *   courseType: "COMPREHENSIVE" | "SPECIAL_LECTURE",
 *   productId?: string,
 *   cohortId?: string,
 *   specialLectureId?: string,
 *   startDate: string,       // ISO date
 *   endDate?: string,        // ISO date (optional)
 *   regularFee: number,
 *   discountAmount?: number,
 *   finalFee: number,
 *   enrollSource?: EnrollSource,
 *   note?: string,
 * }
 */

import { AdminRole, CourseType, EnrollSource, EnrollmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id: rawId } = await params;
    const recordId = Number(rawId);

    if (!Number.isInteger(recordId) || recordId <= 0) {
      return NextResponse.json({ error: "면담 기록 ID가 올바르지 않습니다." }, { status: 400 });
    }

    // 1. Fetch the CounselingRecord
    const record = await getPrisma().counselingRecord.findUnique({
      where: { id: recordId },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "면담 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!record.student) {
      return NextResponse.json(
        { error: "해당 면담 기록에 연결된 학생이 없습니다." },
        { status: 400 },
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const {
      courseType,
      productId,
      cohortId,
      specialLectureId,
      startDate,
      endDate,
      regularFee,
      discountAmount,
      finalFee,
      enrollSource,
      note,
    } = body as {
      courseType?: string;
      productId?: string;
      cohortId?: string;
      specialLectureId?: string;
      startDate?: string;
      endDate?: string;
      regularFee?: number;
      discountAmount?: number;
      finalFee?: number;
      enrollSource?: string;
      note?: string;
    };

    if (!courseType || !Object.values(CourseType).includes(courseType as CourseType)) {
      return NextResponse.json({ error: "수강 유형을 선택하세요." }, { status: 400 });
    }
    if (courseType === "COMPREHENSIVE" && !productId) {
      return NextResponse.json({ error: "상품을 선택하세요." }, { status: 400 });
    }
    if (courseType === "COMPREHENSIVE" && !cohortId) {
      return NextResponse.json({ error: "기수를 선택하세요." }, { status: 400 });
    }
    if (courseType === "SPECIAL_LECTURE" && !specialLectureId) {
      return NextResponse.json({ error: "특강을 선택하세요." }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: "시작일을 입력하세요." }, { status: 400 });
    }
    if (regularFee === undefined || regularFee === null || Number(regularFee) < 0) {
      return NextResponse.json({ error: "수강료를 입력하세요." }, { status: 400 });
    }
    if (finalFee === undefined || finalFee === null || Number(finalFee) < 0) {
      return NextResponse.json({ error: "최종 수강료를 입력하세요." }, { status: 400 });
    }

    // 3. Capacity check for cohort
    let enrollmentStatus: EnrollmentStatus = "PENDING";
    let waitlistOrder: number | null = null;

    if (cohortId) {
      const cohort = await getPrisma().cohort.findUnique({ where: { id: cohortId } });
      if (cohort?.maxCapacity) {
        const activeCount = await getPrisma().courseEnrollment.count({
          where: {
            cohortId,
            status: { in: ["PENDING", "ACTIVE"] },
          },
        });
        if (activeCount >= cohort.maxCapacity) {
          const maxWaitlist = await getPrisma().courseEnrollment.aggregate({
            where: { cohortId, status: "WAITING" },
            _max: { waitlistOrder: true },
          });
          enrollmentStatus = "WAITING";
          waitlistOrder = (maxWaitlist._max.waitlistOrder ?? 0) + 1;
        }
      }
    }

    // 4. Create enrollment in a transaction, audit-logged
    const enrollment = await getPrisma().$transaction(async (tx) => {
      const created = await tx.courseEnrollment.create({
        data: {
          examNumber: record.examNumber,
          courseType: courseType as CourseType,
          productId: productId ?? null,
          cohortId: cohortId ?? null,
          specialLectureId: specialLectureId ?? null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          regularFee: Number(regularFee),
          discountAmount: Number(discountAmount ?? 0),
          finalFee: Number(finalFee),
          status: enrollmentStatus,
          waitlistOrder,
          enrollSource: (enrollSource as EnrollSource) ?? "VISIT",
          staffId: auth.context.adminUser.id,
          isRe: false,
          extraData: {
            fromCounselingRecordId: recordId,
            ...(note ? { note } : {}),
          },
        },
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { name: true } },
          product: { select: { name: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_ENROLLMENT_FROM_COUNSELING",
          targetType: "courseEnrollment",
          targetId: created.id,
          after: {
            examNumber: created.examNumber,
            courseType: created.courseType,
            finalFee: created.finalFee,
            status: created.status,
            fromCounselingRecordId: recordId,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return created;
    });

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수강 등록 전환에 실패했습니다." },
      { status: 400 },
    );
  }
}
