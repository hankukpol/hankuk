import { getCurrentAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Encode makeup date into the note field.
 * Format: "[MAKEUP:YYYY-MM-DD] original note"
 */
export function encodeMakeupNote(makeupDate: string | null, originalNote: string | null): string | null {
  const baseNote = stripMakeupTag(originalNote ?? "").trim();
  if (!makeupDate) {
    return baseNote || null;
  }
  const tag = `[MAKEUP:${makeupDate}]`;
  return baseNote ? `${tag} ${baseNote}` : tag;
}

/**
 * Parse makeup date from note field.
 */
export function parseMakeupDate(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[MAKEUP:(\d{4}-\d{2}-\d{2})\]/);
  return match ? match[1] : null;
}

/**
 * Strip makeup tag from note.
 */
function stripMakeupTag(note: string): string {
  return note.replace(/\[MAKEUP:\d{4}-\d{2}-\d{2}\]\s*/g, "").trim();
}

// ─── GET /api/admin/makeups ───────────────────────────────────────────────────
// Returns all cancelled lecture sessions with their makeup status

export async function GET(request: Request) {
  const session = await getCurrentAdminContext();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();

  const { searchParams } = new URL(request.url);
  const cohortId = searchParams.get("cohortId") ?? undefined;
  const status = searchParams.get("status") ?? "all"; // "all" | "pending" | "scheduled" | "completed"

  // Date range: last 6 months to next 3 months
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setMonth(to.getMonth() + 3);
  to.setHours(23, 59, 59, 999);

  const cancelledSessions = await prisma.lectureSession.findMany({
    where: {
      isCancelled: true,
      sessionDate: { gte: from, lte: to },
      ...(cohortId ? { schedule: { cohortId } } : {}),
    },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
    },
    orderBy: { sessionDate: "desc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = cancelledSessions.map((s) => {
    const makeupDate = parseMakeupDate(s.note);
    const displayNote = stripMakeupTag(s.note ?? "");
    const sessionDateTime = new Date(s.sessionDate);
    sessionDateTime.setHours(0, 0, 0, 0);

    let makeupStatus: "pending" | "scheduled" | "completed" = "pending";
    if (makeupDate) {
      const makeupDt = new Date(makeupDate + "T00:00:00");
      makeupStatus = makeupDt < today ? "completed" : "scheduled";
    }

    return {
      id: s.id,
      scheduleId: s.scheduleId,
      sessionDate: s.sessionDate.toISOString(),
      startTime: s.startTime,
      endTime: s.endTime,
      subjectName: s.schedule.subjectName,
      instructorName: s.schedule.instructorName,
      cohortId: s.schedule.cohortId,
      cohortName: s.schedule.cohort.name,
      examCategory: s.schedule.cohort.examCategory,
      makeupDate,
      makeupStatus,
      note: displayNote,
    };
  });

  // Filter by status
  const filtered =
    status === "all"
      ? rows
      : rows.filter((r) => r.makeupStatus === status);

  return Response.json({ data: filtered });
}

// ─── PATCH /api/admin/makeups ─────────────────────────────────────────────────
// Update makeup date for a cancelled session

export async function PATCH(request: Request) {
  const session = await getCurrentAdminContext();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { sessionId, makeupDate, note } = body as {
    sessionId?: unknown;
    makeupDate?: unknown;
    note?: unknown;
  };

  if (typeof sessionId !== "string" || !sessionId) {
    return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  }

  // makeupDate: "YYYY-MM-DD" or null to clear
  if (makeupDate !== null && makeupDate !== undefined && typeof makeupDate !== "string") {
    return Response.json({ error: "makeupDate 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (makeupDate && typeof makeupDate === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(makeupDate)) {
    return Response.json({ error: "makeupDate는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
  }

  const prisma = getPrisma();

  // Verify session exists and is cancelled
  const existing = await prisma.lectureSession.findUnique({
    where: { id: sessionId },
    select: { id: true, isCancelled: true, note: true },
  });

  if (!existing) {
    return Response.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!existing.isCancelled) {
    return Response.json({ error: "취소된 세션에만 보강을 설정할 수 있습니다." }, { status: 400 });
  }

  // Preserve existing plain note text, update makeup tag
  const baseNote = typeof note === "string" ? note : stripMakeupTag(existing.note ?? "").trim();
  const newNote = encodeMakeupNote(
    makeupDate as string | null,
    baseNote,
  );

  const updated = await prisma.lectureSession.update({
    where: { id: sessionId },
    data: { note: newNote },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
    },
  });

  const parsedMakeupDate = parseMakeupDate(updated.note);
  const displayNote = stripMakeupTag(updated.note ?? "");

  return Response.json({
    data: {
      id: updated.id,
      makeupDate: parsedMakeupDate,
      note: displayNote,
    },
  });
}
