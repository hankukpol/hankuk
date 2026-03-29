import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  ensureNotificationTemplates,
  updateNotificationTemplate,
} from "@/lib/notifications/template-service";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = params.id?.trim();

  if (!id) {
    return NextResponse.json({ error: "Template id is required." }, { status: 400 });
  }

  let body: { content?: string; solapiTemplateId?: string | null };

  try {
    body = (await request.json()) as { content?: string; solapiTemplateId?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await ensureNotificationTemplates(auth.context.adminUser.id);
    const template = await updateNotificationTemplate({
      id,
      content: body.content ?? "",
      solapiTemplateId: body.solapiTemplateId ?? null,
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update the notification template.",
      },
      { status: 400 },
    );
  }
}
