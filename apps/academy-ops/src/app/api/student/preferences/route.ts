import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

export const dynamic = "force-dynamic";

// ─── GET: 알림·수신 환경설정 조회 ─────────────────────────────────────────────

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
        notificationConsent: true,
        consentedAt: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "학생 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        examNumber: student.examNumber,
        notificationConsent: student.notificationConsent,
        consentedAt: student.consentedAt,
        // UI-only toggles — persisted per session via client, backed by notificationConsent
        scoreAlerts: student.notificationConsent,
        enrollmentAlerts: student.notificationConsent,
        noticeAlerts: student.notificationConsent,
        marketingConsent: false,
      },
    });
  } catch {
    return NextResponse.json({ error: "환경설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

// ─── PATCH: 알림·수신 환경설정 업데이트 ──────────────────────────────────────

type PatchBody = {
  notificationConsent?: boolean;
  marketingConsent?: boolean;
  scoreAlerts?: boolean;
  enrollmentAlerts?: boolean;
  noticeAlerts?: boolean;
};

export async function PATCH(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as PatchBody;
    const prisma = getPrisma();

    const updateData: {
      notificationConsent?: boolean;
      consentedAt?: Date | null;
    } = {};

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
        notificationConsent: true,
        consentedAt: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "환경설정 저장에 실패했습니다." }, { status: 500 });
  }
}
