import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  ensureNotificationTemplates,
  listNotificationTemplates,
} from "@/lib/notifications/template-service";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await ensureNotificationTemplates(auth.context.adminUser.id);
  const templates = await listNotificationTemplates();

  return NextResponse.json({ templates });
}
