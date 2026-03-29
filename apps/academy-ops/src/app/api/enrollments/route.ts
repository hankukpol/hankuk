import { AdminRole, CourseType, EnrollmentStatus, EnrollSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  applyAcademyScope,
  requireVisibleAcademyId,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope } from "@/lib/discount-codes/service";
import { getPrisma } from "@/lib/prisma";

const TEXT = {
  missingExamNumber: "?숇쾲???낅젰??二쇱꽭??",
  missingCourseType: "?섍컯 ?좏삎???좏깮??二쇱꽭??",
  missingProduct: "?곹뭹???좏깮??二쇱꽭??",
  missingCohort: "湲곗닔瑜??좏깮??二쇱꽭??",
  missingSpecialLecture: "?밴컯???좏깮??二쇱꽭??",
  missingStartDate: "?쒖옉?쇱쓣 ?낅젰??二쇱꽭??",
  invalidRegularFee: "?뺤긽 ?섍컯猷뚮? ?낅젰??二쇱꽭??",
  invalidFinalFee: "理쒖쥌 ?섍컯猷뚮? ?낅젰??二쇱꽭??",
  academyMismatch: "?꾩옱 吏?먯뿉 ?랁븳 ?숈깮留??깅줉?????덉뒿?덈떎.",
  discountCodeNotFound: "?좎씤 肄붾뱶瑜?李얠쓣 ???놁뒿?덈떎.",
  discountCodeInactive: "鍮꾪솢?깊솕???좎씤 肄붾뱶?낅땲??",
  discountCodeUsageExceeded: "?ъ슜 ?잛닔瑜?珥덇낵???좎씤 肄붾뱶?낅땲??",
  discountCodeNotStarted: "?꾩쭅 ?좏슚 湲곌컙???쒖옉?섏? ?딆? 肄붾뱶?낅땲??",
  discountCodeExpired: "留뚮즺???좎씤 肄붾뱶?낅땲??",
  createFailed: "?깅줉???ㅽ뙣?덉뒿?덈떎.",
  courseUnknown: "怨쇱젙 誘몄젙",
} as const;

function buildEnrollmentWhere(
  academyId: number | null,
  filters: {
    examNumber?: string;
    courseType?: CourseType | null;
    status?: EnrollmentStatus | null;
    cohortId?: string;
  },
) {
  return applyAcademyScope(
    {
      ...(filters.examNumber ? { examNumber: filters.examNumber } : {}),
      ...(filters.courseType ? { courseType: filters.courseType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.cohortId ? { cohortId: filters.cohortId } : {}),
    },
    academyId,
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const academyId = resolveVisibleAcademyId(auth.context);
  const examNumber = sp.get("examNumber") ?? undefined;
  const courseType = sp.get("courseType") as CourseType | null;
  const status = sp.get("status") as EnrollmentStatus | null;
  const cohortId = sp.get("cohortId") ?? undefined;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? "50") || 50, 1), 200);
  const skip = (page - 1) * limit;

  const where = buildEnrollmentWhere(academyId, {
    examNumber,
    courseType,
    status,
    cohortId,
  });

  const [enrollments, total] = await getPrisma().$transaction([
    getPrisma().courseEnrollment.findMany({
      where,
      include: {
        student: { select: { name: true, phone: true } },
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    getPrisma().courseEnrollment.count({ where }),
  ]);

  return NextResponse.json({ enrollments, total });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const body = await request.json();
    const {
      examNumber,
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
      isRe,
      extraData,
      discountCodeId,
      privacyConsentGiven,
      notificationConsentGiven,
    } = body;

    if (!examNumber?.trim()) throw new Error(TEXT.missingExamNumber);
    if (!courseType) throw new Error(TEXT.missingCourseType);
    if (courseType === "COMPREHENSIVE" && !productId) throw new Error(TEXT.missingProduct);
    if (courseType === "COMPREHENSIVE" && !cohortId) throw new Error(TEXT.missingCohort);
    if (courseType === "SPECIAL_LECTURE" && !specialLectureId) {
      throw new Error(TEXT.missingSpecialLecture);
    }
    if (!startDate) throw new Error(TEXT.missingStartDate);
    if (regularFee === undefined || regularFee === null || Number(regularFee) < 0) {
      throw new Error(TEXT.invalidRegularFee);
    }
    if (finalFee === undefined || finalFee === null || Number(finalFee) < 0) {
      throw new Error(TEXT.invalidFinalFee);
    }
    if (privacyConsentGiven !== true) {
      throw new Error("媛쒖씤?뺣낫 ?섏쭛쨌?댁슜 ?숈쓽???꾩닔?낅땲??");
    }

    const student = await getPrisma().student.findFirst({
      where: {
        examNumber: examNumber.trim(),
        academyId,
      },
      select: { examNumber: true },
    });

    if (!student) {
      throw new Error(TEXT.academyMismatch);
    }

    let enrollmentStatus: EnrollmentStatus = EnrollmentStatus.PENDING;
    let waitlistOrder: number | null = null;

    if (cohortId) {
      const cohort = await getPrisma().cohort.findFirst({
        where: { id: cohortId },
        select: { maxCapacity: true },
      });

      if (cohort?.maxCapacity) {
        const activeEnrollmentCount = await getPrisma().courseEnrollment.count({
          where: {
            academyId,
            cohortId,
            status: { in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] },
          },
        });

        if (activeEnrollmentCount >= cohort.maxCapacity) {
          const maxWaitlistOrder = await getPrisma().courseEnrollment.aggregate({
            where: {
              academyId,
              cohortId,
              status: EnrollmentStatus.WAITING,
            },
            _max: { waitlistOrder: true },
          });
          enrollmentStatus = EnrollmentStatus.WAITING;
          waitlistOrder = (maxWaitlistOrder._max.waitlistOrder ?? 0) + 1;
        }
      }
    }

    let resolvedDiscountCodeId: number | null = null;
    if (discountCodeId) {
      const codeRecord = await getPrisma().discountCode.findFirst({
        where: applyDiscountCodeAcademyScope({ id: Number(discountCodeId) }, academyId),
      });
      if (!codeRecord) throw new Error(TEXT.discountCodeNotFound);
      if (!codeRecord.isActive) throw new Error(TEXT.discountCodeInactive);
      if (codeRecord.maxUsage !== null && codeRecord.usageCount >= codeRecord.maxUsage) {
        throw new Error(TEXT.discountCodeUsageExceeded);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const validFrom = new Date(codeRecord.validFrom);
      validFrom.setHours(0, 0, 0, 0);
      if (today < validFrom) throw new Error(TEXT.discountCodeNotStarted);
      if (codeRecord.validUntil) {
        const validUntil = new Date(codeRecord.validUntil);
        validUntil.setHours(23, 59, 59, 999);
        if (today > validUntil) throw new Error(TEXT.discountCodeExpired);
      }
      resolvedDiscountCodeId = codeRecord.id;
    }

    const enrollment = await getPrisma().$transaction(async (tx) => {
      const created = await tx.courseEnrollment.create({
        data: {
          academyId,
          examNumber: examNumber.trim(),
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
          enrollSource: (enrollSource as EnrollSource) ?? null,
          staffId: auth.context.adminUser.id,
          isRe: Boolean(isRe ?? false),
          extraData: extraData ?? null,
        },
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { name: true, examCategory: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      });

      if (notificationConsentGiven === true) {
        await tx.student.update({
          where: { examNumber: created.examNumber },
          data: {
            notificationConsent: true,
            consentedAt: new Date(),
          },
        });
      }

      if (resolvedDiscountCodeId !== null) {
        await tx.discountCode.update({
          where: { id: resolvedDiscountCodeId },
          data: { usageCount: { increment: 1 } },
        });
      }

      const courseName =
        created.cohort?.name ?? created.product?.name ?? created.specialLecture?.name ?? TEXT.courseUnknown;
      const privacyConsentedAt = new Date();
      const contractRecord = await tx.courseContract.upsert({
        where: { enrollmentId: created.id },
        create: {
          enrollmentId: created.id,
          items: [{ label: courseName, amount: created.finalFee }],
          privacyConsentedAt,
          staffId: auth.context.adminUser.id,
        },
        update: {
          privacyConsentedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "PRIVACY_CONSENT_RECORDED",
          targetType: "CourseContract",
          targetId: contractRecord.id,
          after: {
            enrollmentId: created.id,
            examNumber: created.examNumber,
            privacyConsentedAt: privacyConsentedAt.toISOString(),
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_ENROLLMENT",
          targetType: "courseEnrollment",
          targetId: contractRecord.id,
          after: {
            examNumber: created.examNumber,
            courseType: created.courseType,
            finalFee: created.finalFee,
            status: created.status,
            ...(resolvedDiscountCodeId !== null ? { discountCodeId: resolvedDiscountCodeId } : {}),
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return created;
    });

    return NextResponse.json({ enrollment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.createFailed },
      { status: 400 },
    );
  }
}