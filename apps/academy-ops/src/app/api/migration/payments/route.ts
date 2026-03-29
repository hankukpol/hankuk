import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RowError = { row: number; reason: string };

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  result.push(current.trim());
  return result;
}

const METHOD_MAP: Record<string, PaymentMethod> = {
  CASH: "CASH",
  CARD: "CARD",
  TRANSFER: "TRANSFER",
  현금: "CASH",
  카드: "CARD",
  이체: "TRANSFER",
  계좌이체: "TRANSFER",
};

const CATEGORY_MAP: Record<string, PaymentCategory> = {
  TUITION: "TUITION",
  TEXTBOOK: "TEXTBOOK",
  FACILITY: "FACILITY",
  ETC: "ETC",
  수강료: "TUITION",
  교재: "TEXTBOOK",
  시설: "FACILITY",
  기타: "ETC",
};

function buildItemName(category: PaymentCategory) {
  switch (category) {
    case "TUITION":
      return "수강료(마이그레이션)";
    case "TEXTBOOK":
      return "교재비(마이그레이션)";
    case "FACILITY":
      return "시설비(마이그레이션)";
    default:
      return "기타(마이그레이션)";
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV 파일이 필요합니다." }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\uFEFF/, ""))
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return NextResponse.json({ error: "업로드할 데이터가 없습니다." }, { status: 400 });
    }

    const dataLines = lines.slice(1);
    const errors: RowError[] = [];
    let inserted = 0;
    let skipped = 0;

    const adminId = auth.context.adminUser.id;
    const prisma = getPrisma();

    for (let index = 0; index < dataLines.length; index += 1) {
      const rowNumber = index + 2;
      const columns = parseCsvLine(dataLines[index]);
      const [examNumberRaw, paidAtRaw, methodRaw, amountRaw, categoryRaw, noteRaw] = columns;

      const examNumber = examNumberRaw?.trim();
      if (!examNumber) {
        errors.push({ row: rowNumber, reason: "학번이 비어 있습니다." });
        continue;
      }

      if (!paidAtRaw?.trim()) {
        errors.push({ row: rowNumber, reason: "결제일이 비어 있습니다." });
        continue;
      }

      const paidAt = new Date(paidAtRaw.trim());
      if (Number.isNaN(paidAt.getTime())) {
        errors.push({ row: rowNumber, reason: `결제일 형식이 올바르지 않습니다: ${paidAtRaw}` });
        continue;
      }

      const methodKey = methodRaw?.trim().toUpperCase() ?? "";
      const method = METHOD_MAP[methodKey] ?? METHOD_MAP[methodRaw?.trim() ?? ""];
      if (!method) {
        errors.push({ row: rowNumber, reason: `결제방법 '${methodRaw}'은(는) 지원하지 않습니다.` });
        continue;
      }

      const amount = Number(amountRaw?.replace(/,/g, "") ?? "");
      if (Number.isNaN(amount) || amount <= 0) {
        errors.push({ row: rowNumber, reason: `수납금액 '${amountRaw}'이(가) 올바르지 않습니다.` });
        continue;
      }

      const categoryKey = categoryRaw?.trim().toUpperCase() ?? "";
      const category = CATEGORY_MAP[categoryKey] ?? CATEGORY_MAP[categoryRaw?.trim() ?? ""] ?? "TUITION";

      const student = await prisma.student.findUnique({
        where: { examNumber },
        select: { examNumber: true },
      });
      if (!student) {
        errors.push({ row: rowNumber, reason: `학번 ${examNumber} 학생을 찾을 수 없습니다.` });
        skipped += 1;
        continue;
      }

      const enrollment = await prisma.courseEnrollment.findFirst({
        where: { examNumber, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            examNumber,
            enrollmentId: enrollment?.id ?? null,
            category,
            method,
            status: PaymentStatus.APPROVED,
            grossAmount: amount,
            discountAmount: 0,
            couponAmount: 0,
            pointAmount: 0,
            netAmount: amount,
            note: noteRaw?.trim() || null,
            processedBy: adminId,
            processedAt: paidAt,
          },
        });

        await tx.paymentItem.create({
          data: {
            paymentId: payment.id,
            itemType: category,
            itemName: buildItemName(category),
            unitPrice: amount,
            quantity: 1,
            amount,
          },
        });
      });

      inserted += 1;
    }

    try {
      await prisma.auditLog.create({
        data: {
          adminId,
          action: "MIGRATION_PAYMENT_EXECUTE",
          targetType: "Payment",
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
      // non-fatal
    }

    return NextResponse.json({ data: { inserted, skipped, errors } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수납 마이그레이션에 실패했습니다." },
      { status: 400 },
    );
  }
}