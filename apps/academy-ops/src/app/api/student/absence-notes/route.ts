import { AbsenceCategory } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import {
  createStudentAbsenceNote,
  getStudentPortalAbsenceNotePageData,
} from "@/student-portal-api-data";

type RequestBody = {
  sessionId?: number;
  reason?: unknown;
  absenceCategory?: AbsenceCategory;
};

function parsePeriodId(value: string | null) {
  if (!value) {
    return undefined;
  }

  const periodId = Number(value);

  if (!Number.isInteger(periodId) || periodId <= 0) {
    throw new Error("INVALID_PERIOD_ID");
  }

  return periodId;
}

function parseAbsenceCategory(value: AbsenceCategory | undefined) {
  if (!value) {
    return AbsenceCategory.OTHER;
  }

  if (!Object.values(AbsenceCategory).includes(value)) {
    throw new Error("INVALID_ABSENCE_CATEGORY");
  }

  return value;
}

function parseReason(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("INVALID_REASON");
  }

  return value;
}

function assertResolvedPeriod(
  requestedPeriodId: number | undefined,
  data: { selectedPeriod: { id: number } | null },
) {
  if (requestedPeriodId !== undefined && data.selectedPeriod?.id !== requestedPeriodId) {
    throw new Error("UNKNOWN_PERIOD_ID");
  }
}

function mapReadError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";

  switch (code) {
    case "INVALID_PERIOD_ID":
      return { status: 400, error: "Invalid periodId." };
    case "UNKNOWN_PERIOD_ID":
      return { status: 400, error: "The requested period is not available for this student." };
    default:
      return { status: 400, error: "Failed to load absence notes." };
  }
}

function mapError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";

  switch (code) {
    case "INVALID_SESSION_ID":
      return { status: 400, error: "Invalid sessionId." };
    case "INVALID_REASON":
      return { status: 400, error: "Reason is required." };
    case "INVALID_ABSENCE_CATEGORY":
      return { status: 400, error: "Invalid absence category." };
    case "SESSION_NOT_FOUND":
      return { status: 404, error: "Session not found." };
    case "SESSION_FORBIDDEN":
      return { status: 403, error: "You can only submit notes for your own period and exam type." };
    case "SESSION_CANCELLED":
      return { status: 400, error: "Cancelled sessions cannot receive absence notes." };
    case "ABSENCE_NOTE_ALREADY_EXISTS":
      return { status: 409, error: "An absence note already exists for this session." };
    case "SESSION_ALREADY_SCORED":
      return { status: 400, error: "Auto-approved military notes cannot override an already scored session." };
    default:
      return { status: 400, error: "Failed to create absence note." };
  }
}

export async function GET(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const periodId = parsePeriodId(url.searchParams.get("periodId"));
    const data = await getStudentPortalAbsenceNotePageData({
      examNumber: auth.student.examNumber,
      periodId,
    });

    if (!data) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    assertResolvedPeriod(periodId, data);

    return NextResponse.json({ data });
  } catch (error) {
    const mapped = mapReadError(error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const note = await createStudentAbsenceNote({
      examNumber: auth.student.examNumber,
      sessionId: Number(body.sessionId ?? 0),
      reason: parseReason(body.reason),
      absenceCategory: parseAbsenceCategory(body.absenceCategory),
    });

    return NextResponse.json({ note });
  } catch (error) {
    const mapped = mapError(error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
}
