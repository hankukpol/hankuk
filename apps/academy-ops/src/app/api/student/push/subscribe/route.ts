import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteStudentPushSubscription,
  upsertStudentPushSubscription,
} from "@/lib/notifications/web-push";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const removeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = subscriptionSchema.parse(await request.json());
    const subscription = await upsertStudentPushSubscription({
      examNumber: auth.student.examNumber,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      endpoint: subscription.endpoint,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "푸시 구독 저장에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = removeSchema.parse(await request.json());
    const result = await deleteStudentPushSubscription({
      examNumber: auth.student.examNumber,
      endpoint: body.endpoint,
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "푸시 구독 해제에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}