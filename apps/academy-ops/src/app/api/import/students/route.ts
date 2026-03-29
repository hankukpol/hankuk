import { NextRequest } from "next/server";
import { AdminRole, ExamType } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseBirthDate(raw: string | null): Date | null {
  if (!raw || raw.trim().length === 0) return null;
  const digits = raw.trim().replace(/[^0-9]/g, "");
  if (digits.length !== 6) return null;

  const yy = Number.parseInt(digits.slice(0, 2), 10);
  const mm = Number.parseInt(digits.slice(2, 4), 10);
  const dd = Number.parseInt(digits.slice(4, 6), 10);

  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const year = yy >= 30 ? 1900 + yy : 2000 + yy;
  return new Date(year, mm - 1, dd);
}

function generateExamNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `${yy}${mm}${rand}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: { students?: unknown };
  try {
    body = (await request.json()) as { students?: unknown };
  } catch {
    return Response.json({ error: "JSON 파싱 중 오류가 발생했습니다." }, { status: 400 });
  }

  if (!Array.isArray(body.students)) {
    return Response.json({ error: "students 배열이 필요합니다." }, { status: 400 });
  }

  if (body.students.length === 0) {
    return Response.json({ error: "등록할 학생 데이터가 없습니다." }, { status: 400 });
  }

  if (body.students.length > 1000) {
    return Response.json(
      { error: "한 번에 최대 1,000명까지 처리할 수 있습니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let index = 0; index < body.students.length; index += 1) {
    const raw = body.students[index] as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) {
      errors.push(`행 ${index + 1}: 이름이 비어 있습니다.`);
      continue;
    }

    const examType: ExamType = raw.examType === "GYEONGCHAE" ? "GYEONGCHAE" : "GONGCHAE";
    const phone = typeof raw.phone === "string" && raw.phone.trim() ? raw.phone.trim() : null;
    const birthDate = parseBirthDate(typeof raw.birthDate === "string" ? raw.birthDate : null);
    const providedExamNumber =
      typeof raw.examNumber === "string" && raw.examNumber.trim() ? raw.examNumber.trim() : null;

    try {
      if (providedExamNumber) {
        const existing = await prisma.student.findUnique({ where: { examNumber: providedExamNumber } });

        if (existing) {
          await prisma.student.update({
            where: { examNumber: providedExamNumber },
            data: { name, phone, birthDate, examType },
          });
          updated += 1;
        } else {
          await prisma.student.create({
            data: {
              examNumber: providedExamNumber,
              name,
              phone,
              birthDate,
              examType,
              studentType: "NEW",
            },
          });
          created += 1;
        }
        continue;
      }

      let examNumber = generateExamNumber();
      let attempts = 0;
      while (attempts < 5) {
        const conflict = await prisma.student.findUnique({ where: { examNumber } });
        if (!conflict) break;
        examNumber = generateExamNumber();
        attempts += 1;
      }

      await prisma.student.create({
        data: {
          examNumber,
          name,
          phone,
          birthDate,
          examType,
          studentType: "NEW",
        },
      });
      created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`행 ${index + 1} (${name}): ${message.slice(0, 100)}`);
    }
  }

  return Response.json({
    data: { created, updated, errors },
  });
}