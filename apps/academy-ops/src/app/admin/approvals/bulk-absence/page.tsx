import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BulkAbsenceClient } from "./bulk-absence-client";

export const dynamic = "force-dynamic";

export type AbsenceNoteRow = {
  id: number;
  examNumber: string;
  studentName: string;
  sessionDate: string; // ISO date string
  reason: string;
  absenceCategory: string | null;
  submittedAt: string | null;
  createdAt: string;
};

export default async function BulkAbsencePage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  let rows: AbsenceNoteRow[] = [];
  try {
    const notes = await prisma.absenceNote.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        student: { select: { name: true } },
        session: { select: { examDate: true } },
      },
    });

    rows = notes.map((n) => ({
      id: n.id,
      examNumber: n.examNumber,
      studentName: n.student.name,
      sessionDate: n.session.examDate.toISOString(),
      reason: n.reason,
      absenceCategory: n.absenceCategory ?? null,
      submittedAt: n.submittedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  } catch {
    // 데이터 없음
  }

  return <BulkAbsenceClient initialRows={rows} />;
}
