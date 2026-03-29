import { Subject } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getStudentPortalScoresData, getStudentPortalScoreSessionDetail } from "@/student-portal-api-data";

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

function parseDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error("INVALID_DATE");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("INVALID_DATE");
  }

  return value;
}

function parseMonthKey(value: string | null) {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})-(\d{1,2})$/);

  if (!match) {
    throw new Error("INVALID_MONTH_KEY");
  }

  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    throw new Error("INVALID_MONTH_KEY");
  }

  return `${match[1]}-${month}`;
}

function parseSubject(value: string | null) {
  if (!value) {
    return undefined;
  }

  if (!Object.values(Subject).includes(value as Subject)) {
    throw new Error("INVALID_SUBJECT");
  }

  return value as Subject;
}

function assertResolvedSelection(
  requested: {
    periodId?: number;
    date?: string;
    monthKey?: string;
    subject?: Subject;
  },
  resolved: {
    selectedPeriod: { id: number } | null;
    selectedDate: string;
    selectedMonthKey: string;
    selectedSubject?: Subject;
  },
) {
  if (requested.periodId !== undefined && resolved.selectedPeriod?.id !== requested.periodId) {
    throw new Error("UNKNOWN_PERIOD_ID");
  }

  if (requested.date !== undefined && resolved.selectedDate !== requested.date) {
    throw new Error("DATE_OUT_OF_SCOPE");
  }

  if (requested.monthKey !== undefined && resolved.selectedMonthKey !== requested.monthKey) {
    throw new Error("MONTH_KEY_OUT_OF_SCOPE");
  }

  if (requested.subject !== undefined && resolved.selectedSubject !== requested.subject) {
    throw new Error("SUBJECT_OUT_OF_SCOPE");
  }
}

function toErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";

  switch (code) {
    case "INVALID_PERIOD_ID":
      return "Invalid periodId.";
    case "INVALID_DATE":
      return "Invalid date format.";
    case "INVALID_MONTH_KEY":
      return "Invalid monthKey.";
    case "INVALID_SUBJECT":
      return "Invalid subject.";
    case "UNKNOWN_PERIOD_ID":
      return "The requested period is not available for this student.";
    case "DATE_OUT_OF_SCOPE":
      return "The requested date is not available for this student.";
    case "MONTH_KEY_OUT_OF_SCOPE":
      return "The requested month is not available for this student.";
    case "SUBJECT_OUT_OF_SCOPE":
      return "The requested subject is not available for this student.";
    default:
      return "Failed to load student score data.";
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ?dateKey=YYYY-MM-DD → 회차 상세 반환
  const dateKeyParam = request.nextUrl.searchParams.get("dateKey");
  if (dateKeyParam !== null) {
    const dateKey = parseDate(dateKeyParam);
    if (!dateKey) {
      return NextResponse.json({ error: "Invalid dateKey format." }, { status: 400 });
    }
    const detail = await getStudentPortalScoreSessionDetail({
      examNumber: auth.student.examNumber,
      dateKey,
    });
    if (!detail) {
      return NextResponse.json({ error: "No scores found for this date." }, { status: 404 });
    }
    return NextResponse.json({ data: detail });
  }

  try {
    const requested = {
      periodId: parsePeriodId(request.nextUrl.searchParams.get("periodId")),
      date: parseDate(request.nextUrl.searchParams.get("date")),
      monthKey: parseMonthKey(request.nextUrl.searchParams.get("monthKey")),
      subject: parseSubject(request.nextUrl.searchParams.get("subject")),
    };
    const data = await getStudentPortalScoresData({
      examNumber: auth.student.examNumber,
      ...requested,
    });

    if (!data) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    assertResolvedSelection(requested, data);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 400 });
  }
}