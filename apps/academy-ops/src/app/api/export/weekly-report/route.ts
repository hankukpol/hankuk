import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { handleWeeklyReportExportPost } from "@/lib/export/weekly-report-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  return handleWeeklyReportExportPost({
    request,
    auth: auth.ok
      ? {
          ok: true,
          adminId: auth.context.adminUser.id,
        }
      : auth,
  });
}
