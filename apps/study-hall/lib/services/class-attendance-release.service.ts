import { createHash } from "node:crypto";
import { isClassAttendance } from "@/lib/attendance-meta";
import { badRequest } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";

type Selection = { studentIds: string[]; periodIds: string[]; dates: string[] };
type Row = { id: string; studentId: string; periodId: string; date: string | Date;
  status: string; reason: string | null; updatedAt: string | Date; examAutoSource?: string | null };
const day = (value: string | Date) => typeof value === "string" ? value : value.toISOString().slice(0, 10);

/** Selection has already passed recurring attendance's tenant, period and range validation. */
export async function releaseClassAttendance(
  divisionSlug: string, selection: Selection, preview: boolean, expectedToken?: string,
) {
  const matches = (r: Row) => selection.studentIds.includes(r.studentId)
    && selection.periodIds.includes(r.periodId) && selection.dates.includes(day(r.date));
  const plan = (rows: Row[]) => {
    const scoped = rows.filter(matches);
    // Exam-derived rows and ordinary excuses are never class-release targets.
    const targets = scoped.filter(r => !r.examAutoSource && isClassAttendance(r.status, r.reason));
    const token = createHash("sha256").update(JSON.stringify({ divisionSlug, selection,
      rows: scoped.slice().sort((a,b) => a.id.localeCompare(b.id)),
    })).digest("hex");
    if (!preview && token !== expectedToken) throw badRequest("출결이 변경되었습니다. 해제 대상을 다시 확인해 주세요.");
    return { targets, token, protectedCount: scoped.length - targets.length };
  };
  const result = (p: ReturnType<typeof plan>) => ({ releasedCount: p.targets.length,
    protectedCount: p.protectedCount, previewToken: p.token, preview });

  if (isMockMode()) {
    if (preview) return result(plan((await readMockState()).attendanceByDivision[divisionSlug] ?? []));
    return updateMockState(state => {
      const rows = state.attendanceByDivision[divisionSlug] ?? [];
      const p = plan(rows), ids = new Set(p.targets.map(r => r.id));
      state.attendanceByDivision[divisionSlug] = rows.filter(r => !ids.has(r.id));
      return result(p);
    });
  }
  const prisma = await getPrismaClient();
  const where = { student: { division: { slug: divisionSlug } },
    studentId: { in: selection.studentIds }, periodId: { in: selection.periodIds },
    date: { in: selection.dates.map(date => new Date(`${date}T00:00:00Z`)) } };
  if (preview) return result(plan(await prisma.attendance.findMany({ where })));
  return prisma.$transaction(async tx => {
    const p = plan(await tx.attendance.findMany({ where }));
    if (p.targets.length) {
      const deleted = await tx.attendance.deleteMany({ where: { ...where,
        id: { in: p.targets.map(r => r.id) }, status: "EXCUSED", examAutoSource: null,
      } });
      if (deleted.count !== p.targets.length) throw badRequest("출결이 변경되었습니다. 해제 대상을 다시 확인해 주세요.");
    }
    return result(p);
  }, { isolationLevel: "Serializable", timeout: 15000 });
}

