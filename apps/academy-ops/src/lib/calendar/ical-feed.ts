import { createHmac, timingSafeEqual } from "node:crypto";
import { ExamType, Subject } from "@prisma/client";
import { EXAM_TYPE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";

const ICAL_FEED_VERSION = 1 as const;
const SEOUL_TIME_ZONE = "Asia/Seoul";

export type IcalFeedTokenPayload = {
  v: typeof ICAL_FEED_VERSION;
  adminId: string;
  periodId: number;
  examType: ExamType;
};

export type IcalExamSession = {
  id: number;
  week: number;
  subject: Subject;
  displaySubjectName?: string | null;
  examDate: Date;
  isCancelled: boolean;
  cancelReason?: string | null;
  updatedAt: Date;
};

type SerializeExamScheduleIcalInput = {
  periodName: string;
  examType: ExamType;
  sessions: IcalExamSession[];
  generatedAt?: Date;
  feedUrl?: string | null;
};

function getIcalFeedSecret() {
  const secret = process.env.ICAL_FEED_SECRET?.trim();

  if (!secret) {
    throw new Error("ICAL_FEED_SECRET is required for iCal subscriptions.");
  }

  return secret;
}

function sign(encoded: string) {
  return createHmac("sha256", getIcalFeedSecret()).update(encoded).digest("base64url");
}

function escapeIcalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcalLine(line: string) {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const nextBytes = Buffer.byteLength(char, "utf8");

    if (current && currentBytes + nextBytes > 72) {
      chunks.push(current);
      current = char;
      currentBytes = nextBytes;
      continue;
    }

    current += char;
    currentBytes += nextBytes;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.join("\r\n ");
}

function buildIcalLine(name: string, value: string) {
  return foldIcalLine(`${name}:${escapeIcalText(value)}`);
}

function formatUtcTimestamp(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function getSeoulDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
  };
}

function addCalendarDays(parts: ReturnType<typeof getSeoulDateParts>, days: number) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function formatDateParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

function buildSummary(input: {
  examType: ExamType;
  week: number;
  subject: Subject;
  displaySubjectName?: string | null;
  isCancelled: boolean;
}) {
  const subjectLabel = getSubjectDisplayLabel(input.subject, input.displaySubjectName);
  return `${EXAM_TYPE_LABEL[input.examType]} ${input.week}주차 ${subjectLabel}${input.isCancelled ? " [취소]" : ""}`;
}

function buildDescription(input: {
  periodName: string;
  examType: ExamType;
  session: IcalExamSession;
}) {
  const subjectLabel = getSubjectDisplayLabel(input.session.subject, input.session.displaySubjectName);
  const lines = [
    `시험 기간: ${input.periodName}`,
    `직렬: ${EXAM_TYPE_LABEL[input.examType]}`,
    `주차: ${input.session.week}주차`,
    `과목: ${subjectLabel}`,
    input.session.isCancelled ? "상태: 취소" : "상태: 예정",
  ];

  if (input.session.cancelReason?.trim()) {
    lines.push(`취소 사유: ${input.session.cancelReason.trim()}`);
  }

  return lines.join("\n");
}

function buildFileSlug(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "period";
}

function encodeToken(payload: IcalFeedTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function hasIcalFeedSecret() {
  return Boolean(process.env.ICAL_FEED_SECRET?.trim());
}

export function createIcalFeedToken(input: Omit<IcalFeedTokenPayload, "v">) {
  return encodeToken({
    v: ICAL_FEED_VERSION,
    adminId: input.adminId,
    periodId: input.periodId,
    examType: input.examType,
  });
}

export function readIcalFeedToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expectedSignature = sign(encoded);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<IcalFeedTokenPayload>;

    if (
      payload.v !== ICAL_FEED_VERSION ||
      typeof payload.adminId !== "string" ||
      typeof payload.periodId !== "number" ||
      !Object.values(ExamType).includes(payload.examType as ExamType)
    ) {
      return null;
    }

    return payload as IcalFeedTokenPayload;
  } catch {
    return null;
  }
}

export function buildIcalFeedPath(input: {
  periodId: number;
  examType: ExamType;
  token: string;
}) {
  const params = new URLSearchParams({
    periodId: String(input.periodId),
    examType: input.examType,
    token: input.token,
  });

  return `/api/calendar/ical?${params.toString()}`;
}

export function buildIcalFileName(periodName: string, examType: ExamType) {
  return `morning-mock-${examType.toLowerCase()}-${buildFileSlug(periodName)}.ics`;
}

export function serializeExamScheduleIcal(input: SerializeExamScheduleIcalInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const calendarName = `${input.periodName} ${EXAM_TYPE_LABEL[input.examType]} 시험 일정`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Morning Mock//Exam Schedule//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    buildIcalLine("X-WR-CALNAME", calendarName),
    `X-WR-TIMEZONE:${SEOUL_TIME_ZONE}`,
  ];

  if (input.feedUrl) {
    lines.push(buildIcalLine("URL", input.feedUrl));
  }

  for (const session of input.sessions) {
    const startDate = getSeoulDateParts(session.examDate);
    const endDate = addCalendarDays(startDate, 1);

    lines.push(
      "BEGIN:VEVENT",
      `UID:exam-session-${session.id}@morning-mock.local`,
      `DTSTAMP:${formatUtcTimestamp(generatedAt)}`,
      `LAST-MODIFIED:${formatUtcTimestamp(session.updatedAt)}`,
      `DTSTART;VALUE=DATE:${formatDateParts(startDate)}`,
      `DTEND;VALUE=DATE:${formatDateParts(endDate)}`,
      buildIcalLine(
        "SUMMARY",
        buildSummary({
          examType: input.examType,
          week: session.week,
          subject: session.subject,
          displaySubjectName: session.displaySubjectName,
          isCancelled: session.isCancelled,
        }),
      ),
      buildIcalLine(
        "DESCRIPTION",
        buildDescription({
          periodName: input.periodName,
          examType: input.examType,
          session,
        }),
      ),
      session.isCancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}
