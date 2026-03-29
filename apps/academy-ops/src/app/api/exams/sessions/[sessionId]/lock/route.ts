import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { sessionId } = await params;
  const id = parseInt(sessionId, 10);
  if (isNaN(id)) {
    return Response.json({ error: "잘못된 회차 ID입니다." }, { status: 400 });
  }

  const prisma = getPrisma();

  const session = await prisma.examSession.findUnique({
    where: { id },
    select: { id: true, isLocked: true, lockedBy: true },
  });

  if (!session) {
    return Response.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
  }

  const adminId = auth.context.adminUser.id;

  if (session.isLocked) {
    // Unlock
    const updated = await prisma.examSession.update({
      where: { id },
      data: {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
      },
      select: { id: true, isLocked: true, lockedBy: true, lockedAt: true },
    });
    return Response.json({ data: updated });
  } else {
    // Lock
    const updated = await prisma.examSession.update({
      where: { id },
      data: {
        isLocked: true,
        lockedBy: adminId,
        lockedAt: new Date(),
      },
      select: { id: true, isLocked: true, lockedBy: true, lockedAt: true },
    });
    return Response.json({ data: updated });
  }
}
