import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { updateNotificationConsent } from "@/lib/notifications/service";

type RequestBody = {
  examNumber?: string;
  consent?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const result = await updateNotificationConsent({
      adminId: auth.context.adminUser.id,
      examNumber: String(body.examNumber ?? "").trim(),
      consent: Boolean(body.consent),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "수신 동의 설정에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
