import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";

export const dynamic = "force-dynamic";

type NotifyRequestBody = {
  enrollmentIds?: unknown;
};

function getCourseName(enrollment: {
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}) {
  if (enrollment.specialLecture) return enrollment.specialLecture.name;
  if (enrollment.product) return enrollment.product.name;
  if (enrollment.cohort) return enrollment.cohort.name;
  return "";
}

function formatEnrollmentPeriod(
  startDate: Date,
  endDate: Date | null,
): string {
  const start = startDate
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
  if (!endDate) return start;
  const end = endDate
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
  return `${start} ~ ${end}`;
}

/**
 * POST /api/enrollments/expiring/notify
 * 만료 예정 수강생들에게 재등록 안내 알림을 일괄 발송한다.
 * Body: { enrollmentIds: string[] }
 * Returns: { sent: number, failed: number }
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as NotifyRequestBody;
    const rawIds = body.enrollmentIds;

    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: "enrollmentIds 배열이 필요합니다." }, { status: 400 });
    }

    const enrollmentIds = rawIds.filter((id) => typeof id === "string") as string[];
    if (enrollmentIds.length === 0) {
      return NextResponse.json({ error: "유효한 enrollmentId가 없습니다." }, { status: 400 });
    }

    const enrollments = await getPrisma().courseEnrollment.findMany({
      where: { id: { in: enrollmentIds } },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            notificationConsent: true,
          },
        },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
    });

    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
      enrollments.map(async (enrollment) => {
        try {
          const courseName = getCourseName(enrollment);
          const enrollmentPeriod = formatEnrollmentPeriod(
            enrollment.startDate,
            enrollment.endDate,
          );

          await sendEventNotification({
            examNumber: enrollment.student.examNumber,
            type: "ENROLLMENT_COMPLETE",
            messageInput: {
              studentName: enrollment.student.name,
              courseName,
              enrollmentPeriod,
            },
            dedupeKey: `expiry-notify:${enrollment.id}:${new Date().toISOString().slice(0, 10)}`,
          });

          sent++;
        } catch {
          failed++;
        }
      }),
    );

    return NextResponse.json({ data: { sent, failed, total: enrollments.length } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알림 발송 실패" },
      { status: 500 },
    );
  }
}
