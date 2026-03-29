import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const academyId = resolveVisibleAcademyId(auth.context);
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5", 10) || 5, 1), 20);

  if (q.length < 2) {
    return Response.json({ students: [] });
  }

  const students = await getPrisma().student.findMany({
    where: {
      ...(academyId === null ? {} : { academyId }),
      isActive: true,
      OR: [{ name: { contains: q } }, { examNumber: { contains: q } }],
    },
    select: { examNumber: true, name: true, phone: true },
    take: limit,
    orderBy: { examNumber: "asc" },
  });

  return Response.json({ students });
}