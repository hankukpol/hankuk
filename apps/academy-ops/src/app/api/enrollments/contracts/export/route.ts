import { AdminRole, CourseType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { createCsvBuffer, createDownloadResponse } from "@/lib/export";
import { getPrisma } from "@/lib/prisma";

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

type ContractRow = Prisma.CourseContractGetPayload<{
  include: {
    enrollment: {
      include: {
        student: { select: { examNumber: true; name: true; phone: true; notificationConsent: true } };
        cohort: { select: { name: true } };
        product: { select: { name: true } };
        specialLecture: { select: { name: true } };
      };
    };
    staff: { select: { name: true } };
  };
}>;

function formatDate(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const academyId = resolveVisibleAcademyId(auth.context);

  const contractWhere: Prisma.CourseContractWhereInput = {};
  const status = sp.get("status");
  const consent = sp.get("consent");
  const courseType = sp.get("courseType") as CourseType | null;
  const from = sp.get("from");
  const to = sp.get("to");
  const query = sp.get("q")?.trim();

  if (status === "printed") {
    contractWhere.printedAt = { not: null };
  } else if (status === "unprinted") {
    contractWhere.printedAt = null;
  }

  if (consent === "recorded") {
    contractWhere.privacyConsentedAt = { not: null };
  } else if (consent === "missing") {
    contractWhere.privacyConsentedAt = null;
  }

  if (from || to) {
    contractWhere.issuedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }

  const enrollmentFilter = applyAcademyScope(
    {
      ...(courseType ? { courseType } : {}),
      ...(query
        ? {
            OR: [
              { examNumber: { contains: query } },
              { student: { is: { name: { contains: query } } } },
              { student: { is: { phone: { contains: query } } } },
            ],
          }
        : {}),
    },
    academyId,
  ) as Prisma.CourseEnrollmentWhereInput;

  const rows: ContractRow[] = await getPrisma().courseContract.findMany({
    where: {
      ...contractWhere,
      enrollment: { is: enrollmentFilter },
    },
    include: {
      enrollment: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
              notificationConsent: true,
            },
          },
          cohort: { select: { name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      },
      staff: { select: { name: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  const buffer = createCsvBuffer(rows, [
    { header: "학생명", value: (row) => row.enrollment.student.name },
    { header: "학번", value: (row) => row.enrollment.student.examNumber },
    { header: "연락처", value: (row) => row.enrollment.student.phone ?? "" },
    {
      header: "수강내역",
      value: (row) => row.enrollment.cohort?.name ?? row.enrollment.product?.name ?? row.enrollment.specialLecture?.name ?? "",
    },
    { header: "강좌 유형", value: (row) => COURSE_TYPE_LABEL[row.enrollment.courseType] },
    { header: "필수 동의 기록", value: (row) => (row.privacyConsentedAt ? "완료" : "미기록") },
    { header: "필수 동의 일시", value: (row) => formatDate(row.privacyConsentedAt) },
    { header: "선택 알림 수신 동의", value: (row) => (row.enrollment.student.notificationConsent ? "동의" : "미동의") },
    { header: "발급일", value: (row) => formatDate(row.issuedAt) },
    { header: "출력일", value: (row) => formatDate(row.printedAt) },
    { header: "담당자", value: (row) => row.staff.name },
  ]);

  return createDownloadResponse(
    buffer,
    `contracts-${new Date().toISOString().slice(0, 10)}.csv`,
    "csv",
  );
}
