import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RowError = { row: number; reason: string };

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const STATUS_MAP: Record<string, EnrollmentStatus> = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  WITHDRAWN: "WITHDRAWN",
  CANCELLED: "CANCELLED",
  SUSPENDED: "SUSPENDED",
  PENDING: "PENDING",
  WAITING: "WAITING",
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV 파일이 필요합니다." }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\uFEFF/, "")) // strip BOM
      .filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      return NextResponse.json({ error: "데이터 행이 없습니다." }, { status: 400 });
    }

    // Skip header row
    const dataLines = lines.slice(1);
    const errors: RowError[] = [];
    let inserted = 0;
    let skipped = 0;

    const adminId = auth.context.adminUser.id;
    const prisma = getPrisma();

    for (let i = 0; i < dataLines.length; i++) {
      const rowNum = i + 2; // 1-based, accounting for header
      const cols = parseCsvLine(dataLines[i]);

      // Columns: 학번, 수강반명, 등록일, 시작일, 종료일, 수강료, 할인금액, 최종수강료, 상태, 비고
      const [
        examNumber,
        cohortName,
        enrolledAtStr,
        startDateStr,
        endDateStr,
        regularFeeStr,
        discountAmountStr,
        finalFeeStr,
        statusStr,
      ] = cols;

      if (!examNumber?.trim()) {
        errors.push({ row: rowNum, reason: "학번이 없습니다." });
        continue;
      }
      if (!cohortName?.trim()) {
        errors.push({ row: rowNum, reason: "수강반명이 없습니다." });
        continue;
      }
      if (!startDateStr?.trim()) {
        errors.push({ row: rowNum, reason: "시작일이 없습니다." });
        continue;
      }

      // Validate dates
      const startDate = new Date(startDateStr.trim());
      if (isNaN(startDate.getTime())) {
        errors.push({ row: rowNum, reason: `시작일 형식 오류: ${startDateStr}` });
        continue;
      }
      const endDate = endDateStr?.trim() ? new Date(endDateStr.trim()) : null;
      if (endDate && isNaN(endDate.getTime())) {
        errors.push({ row: rowNum, reason: `종료일 형식 오류: ${endDateStr}` });
        continue;
      }
      const enrolledAt = enrolledAtStr?.trim() ? new Date(enrolledAtStr.trim()) : startDate;
      if (isNaN(enrolledAt.getTime())) {
        errors.push({ row: rowNum, reason: `등록일 형식 오류: ${enrolledAtStr}` });
        continue;
      }

      // Validate fees
      const regularFee = Number(regularFeeStr?.replace(/,/g, "") ?? "0");
      const discountAmount = Number(discountAmountStr?.replace(/,/g, "") ?? "0");
      const finalFee = Number(finalFeeStr?.replace(/,/g, "") ?? "0");
      if (isNaN(regularFee) || isNaN(discountAmount) || isNaN(finalFee)) {
        errors.push({ row: rowNum, reason: "수강료 숫자 형식 오류" });
        continue;
      }

      // Validate status
      const status: EnrollmentStatus = STATUS_MAP[statusStr?.trim().toUpperCase() ?? ""] ?? "ACTIVE";

      // Lookup student
      const student = await prisma.student.findUnique({
        where: { examNumber: examNumber.trim() },
        select: { examNumber: true },
      });
      if (!student) {
        errors.push({ row: rowNum, reason: `학번 ${examNumber.trim()} 학생 없음` });
        skipped++;
        continue;
      }

      // Lookup cohort by name (exact match)
      const cohort = await prisma.cohort.findFirst({
        where: { name: cohortName.trim() },
        select: { id: true, examCategory: true },
      });
      if (!cohort) {
        errors.push({ row: rowNum, reason: `수강반명 "${cohortName.trim()}" 없음` });
        skipped++;
        continue;
      }

      // Check for duplicate enrollment (same student + cohort)
      const existing = await prisma.courseEnrollment.findFirst({
        where: {
          examNumber: examNumber.trim(),
          cohortId: cohort.id,
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Find matching product for this cohort's examCategory
      const product = await prisma.comprehensiveCourseProduct.findFirst({
        where: { examCategory: cohort.examCategory, isActive: true },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      // Insert enrollment
      await prisma.courseEnrollment.create({
        data: {
          examNumber: examNumber.trim(),
          courseType: CourseType.COMPREHENSIVE,
          cohortId: cohort.id,
          productId: product?.id ?? null,
          startDate,
          endDate,
          regularFee,
          discountAmount,
          finalFee,
          status,
          staffId: adminId,
          enrollSource: "VISIT",
          extraData: { migratedAt: new Date().toISOString(), enrolledAt: enrolledAt.toISOString() },
        },
      });
      inserted++;
    }

    // Log migration action
    try {
      await getPrisma().auditLog.create({
        data: {
          adminId,
          action: "MIGRATION_ENROLLMENT_EXECUTE",
          targetType: "CourseEnrollment",
          targetId: "migration",
          after: {
            fileName: file.name,
            importedCount: inserted,
            skippedCount: skipped,
            errorCount: errors.length,
          },
        },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ data: { inserted, skipped, errors } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수강 등록 마이그레이션 실패" },
      { status: 400 },
    );
  }
}
