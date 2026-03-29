import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { parseOptionalEmail } from "@/lib/email/utils";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

export const dynamic = "force-dynamic";

type PatchBody = {
  phone?: string;
  email?: string | null;
  notificationConsent?: boolean;
};

function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/[\s\-]/g, "");
  return /^\d{10,11}$/.test(digits);
}

export async function GET(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const prisma = getPrisma();
    const student = await prisma.student.findUnique({
      where: { examNumber: auth.student.examNumber },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        email: true,
        notificationConsent: true,
        consentedAt: true,
        registeredAt: true,
        examType: true,
        className: true,
        generation: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "학생 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        examNumber: student.examNumber,
        name: student.name,
        mobile: student.phone ?? null,
        email: student.email ?? null,
        notificationConsent: student.notificationConsent,
        consentedAt: student.consentedAt,
        registeredAt: student.registeredAt,
        examType: student.examType,
        className: student.className,
        generation: student.generation,
      },
    });
  } catch {
    return NextResponse.json({ error: "프로필을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as PatchBody;
    const prisma = getPrisma();

    const updateData: {
      phone?: string | null;
      email?: string | null;
      notificationConsent?: boolean;
      consentedAt?: Date | null;
    } = {};

    if (body.phone !== undefined) {
      const trimmed = body.phone.trim();
      if (trimmed !== "" && !isValidPhoneNumber(trimmed)) {
        return NextResponse.json(
          { error: "올바른 연락처 형식이 아닙니다. 예: 010-1234-5678" },
          { status: 400 },
        );
      }
      updateData.phone = trimmed !== "" ? trimmed : null;
    }

    if (body.email !== undefined) {
      updateData.email = parseOptionalEmail(body.email, "이메일");
    }

    if (typeof body.notificationConsent === "boolean") {
      updateData.notificationConsent = body.notificationConsent;
      updateData.consentedAt = body.notificationConsent ? new Date() : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "변경할 항목이 없습니다." }, { status: 400 });
    }

    const updated = await prisma.student.update({
      where: { examNumber: auth.student.examNumber },
      data: updateData,
      select: {
        examNumber: true,
        name: true,
        phone: true,
        email: true,
        notificationConsent: true,
        consentedAt: true,
        examType: true,
      },
    });

    return NextResponse.json({
      data: {
        ...updated,
        mobile: updated.phone ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로필 저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
