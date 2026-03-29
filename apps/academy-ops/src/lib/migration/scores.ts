import {
  AttendType,
  ExamType,
  Prisma,
  ScoreSource,
  Subject,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import {
  getSheetRows,
  parseExcelDate,
  readWorkbookFromBuffer,
  toCellString,
} from "@/lib/excel/workbook";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { ensurePeriodEnrollments } from "@/lib/periods/enrollments";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { SUBJECT_LABEL } from "@/lib/constants";
import {
  dedupeScoreWriteRecords,
  type ScoreWriteRecord,
} from "@/lib/scores/import-safety";

const MIGRATION_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 600_000,
} as const;
const MIGRATION_WRITE_BATCH_SIZE = 10;
const MIGRATION_STATEMENT_TIMEOUT_MS = 300_000;

function chunkItems<T>(items: readonly T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function isStatementTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("57014") || message.includes("statement timeout");
}

function hasSameScoreWrite(
  existing:
    | Pick<
        ScoreWriteRecord,
        "rawScore" | "oxScore" | "finalScore" | "attendType" | "sourceType" | "note"
      >
    | null
    | undefined,
  incoming: Pick<
    ScoreWriteRecord,
    "rawScore" | "oxScore" | "finalScore" | "attendType" | "sourceType" | "note"
  >,
) {
  return Boolean(
    existing &&
      existing.rawScore === incoming.rawScore &&
      existing.oxScore === incoming.oxScore &&
      existing.finalScore === incoming.finalScore &&
      existing.attendType === incoming.attendType &&
      existing.sourceType === incoming.sourceType &&
      existing.note === incoming.note,
  );
}

function sortScoreWriteRecords(rows: readonly ScoreWriteRecord[]) {
  return [...rows].sort(
    (left, right) =>
      left.sessionId - right.sessionId || left.examNumber.localeCompare(right.examNumber),
  );
}

async function executeMigrationScoreWriteBatch(
  prisma: ReturnType<typeof getPrisma>,
  batch: readonly ScoreWriteRecord[],
) {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT_MS}'`,
      );

      const values = batch.map((row) => Prisma.sql`
        (
          ${row.examNumber},
          ${row.sessionId},
          ${row.rawScore},
          ${row.oxScore},
          ${row.finalScore},
          CAST(${row.attendType} AS "AttendType"),
          CAST(${row.sourceType} AS "ScoreSource"),
          ${row.note},
          NOW()
        )
      `);

      await tx.$executeRaw`
        INSERT INTO "scores" (
          "examNumber",
          "sessionId",
          "rawScore",
          "oxScore",
          "finalScore",
          "attendType",
          "sourceType",
          "note",
          "updatedAt"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("examNumber", "sessionId") DO UPDATE SET
          "rawScore" = EXCLUDED."rawScore",
          "oxScore" = EXCLUDED."oxScore",
          "finalScore" = EXCLUDED."finalScore",
          "attendType" = EXCLUDED."attendType",
          "sourceType" = EXCLUDED."sourceType",
          "note" = EXCLUDED."note",
          "updatedAt" = NOW()
      `;
    },
    MIGRATION_TRANSACTION_OPTIONS,
  );
}

async function upsertMigrationScoreWriteBatch(
  prisma: ReturnType<typeof getPrisma>,
  batch: readonly ScoreWriteRecord[],
): Promise<void> {
  try {
    await executeMigrationScoreWriteBatch(prisma, batch);
  } catch (error) {
    if (!isStatementTimeoutError(error) || batch.length <= 1) {
      throw error;
    }

    const middleIndex = Math.ceil(batch.length / 2);
    await upsertMigrationScoreWriteBatch(prisma, batch.slice(0, middleIndex));
    await upsertMigrationScoreWriteBatch(prisma, batch.slice(middleIndex));
  }
}

async function bulkUpsertMigrationScores(
  prisma: ReturnType<typeof getPrisma>,
  rows: readonly ScoreWriteRecord[],
) {
  const dedupedRows = sortScoreWriteRecords(dedupeScoreWriteRecords(rows));

  for (const batch of chunkItems(dedupedRows, MIGRATION_WRITE_BATCH_SIZE)) {
    await upsertMigrationScoreWriteBatch(prisma, batch);
  }
}

export type ScoreFilePreview = {
  fileName: string;
  detectedType:
    | "offline-score"
    | "offline-errata"
    | "online-score"
    | "online-ox-score"
    | "online-detail"
    | "online-ox-detail"
    | "legacy-workbook"
    | "unknown";
  sheetNames: string[];
  rowCount: number;
  headers: string[];
};

export type LegacyWorkbookScorePreviewRow = {
  rowKey: string;
  sheetName: string;
  week: number;
  subject: Subject;
  sessionId: number | null;
  sessionLabel: string | null;
  sessionExamDate: string | null;
  examNumber: string;
  name: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  status: "ready" | "overwrite" | "invalid";
  issues: string[];
  note: string | null;
};

export type LegacyWorkbookScorePreview = {
  fileName: string;
  period: {
    id: number;
    name: string;
  };
  examType: ExamType;
  sheetNames: string[];
  summary: {
    totalRows: number;
    readyRows: number;
    overwriteRows: number;
    invalidRows: number;
    absentRows: number;
    excusedRows: number;
    affectedSessions: number;
  };
  rows: LegacyWorkbookScorePreviewRow[];
};

type LegacyWorkbookParsedRow = {
  rowKey: string;
  sheetName: string;
  week: number;
  subject: Subject;
  dayKey: string | null;
  sessionId: number | null;
  sessionLabel: string | null;
  sessionExamDate: string | null;
  examNumber: string;
  name: string;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  note: string | null;
};

const SUBJECT_NAME_MAP: Array<[string, Subject]> = [
  ["\uD5CC\uBC95", Subject.CONSTITUTIONAL_LAW],
  ["\uD615\uC0AC\uC18C\uC1A1\uBC95", Subject.CRIMINAL_PROCEDURE],
  ["\uD615\uBC95", Subject.CRIMINAL_LAW],
  ["\uACBD\uCC30\uD559", Subject.POLICE_SCIENCE],
  ["\uBC94\uC8C4\uD559", Subject.CRIMINOLOGY],
  ["\uB204\uC801", Subject.CUMULATIVE],
];

function normalizeText(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").replace(/\./g, "").toLowerCase();
}

function normalizeExamNumber(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").replace(/\.0$/, "");
}

function parseNumericScore(value: unknown) {
  const raw = toCellString(value).replace(/,/g, "").trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const matched = raw.match(/-?\d+(?:\.\d+)?/);

  if (!matched) {
    return null;
  }

  const fallback = Number(matched[0]);
  return Number.isFinite(fallback) ? fallback : null;
}

function computeFinalScore(_subject: Subject, rawScore: number | null, oxScore: number | null) {
  if (rawScore === null && oxScore === null) {
    return null;
  }

  return (rawScore ?? 0) + (oxScore ?? 0);
}

function subjectFromCell(value: unknown) {
  const normalized = normalizeText(value);

  for (const [label, subject] of SUBJECT_NAME_MAP) {
    if (normalized.includes(label.replace(/\s+/g, "").toLowerCase())) {
      return subject;
    }
  }

  return null;
}

function detectScoreFileType(fileName: string, headers: string[], sheetNames: string[]) {
  const normalizedName = fileName.toLowerCase();
  const normalizedHeaders = headers.map((header) =>
    header.replace(/\s+/g, "").toLowerCase(),
  );
  const normalizedSheetNames = sheetNames.map((sheetName) =>
    sheetName.replace(/\s+/g, "").toLowerCase(),
  );

  if (
    normalizedSheetNames.includes("\uC218\uAC15\uC0DD\uBA85\uB2E8") &&
    normalizedSheetNames.some((sheetName) => /^\d+\uC8FC\uCC28$/i.test(sheetName))
  ) {
    return "legacy-workbook";
  }

  if (normalizedName.includes("\uBAA8\uC758\uACE0\uC0AC\uCC44\uC810\uD45C")) {
    return normalizedHeaders.includes("\uC218\uD5D8\uBC88\uD638") ? "offline-score" : "offline-errata";
  }

  if (normalizedName.includes("o,x_\uCC44\uC810\uD45C") || normalizedName.includes("ox_\uCC44\uC810\uD45C")) {
    return "online-ox-detail";
  }

  if (normalizedName.includes("\uCC44\uC810\uD45C")) {
    return "online-detail";
  }

  if (normalizedName.includes("o,x") || normalizedName.includes("ox")) {
    return "online-ox-score";
  }

  if (normalizedHeaders.includes("\uC544\uC774\uB514") && normalizedHeaders.includes("\uC810\uC218")) {
    return "online-score";
  }

  return "unknown";
}
export function previewScoreFiles(
  files: Array<{
    fileName: string;
    buffer: Buffer | ArrayBuffer;
  }>,
) {
  return files.map((file) => {
    const workbook = readWorkbookFromBuffer(file.buffer);
    const firstSheetName = workbook.SheetNames[0];
    const rows = getSheetRows(workbook, firstSheetName);
    const headers = (rows[0] ?? []).map((value) => toCellString(value));

    return {
      fileName: file.fileName,
      detectedType: detectScoreFileType(file.fileName, headers, workbook.SheetNames),
      sheetNames: workbook.SheetNames,
      rowCount: Math.max(rows.length - 1, 0),
      headers,
    } satisfies ScoreFilePreview;
  });
}

function findSubjectColumns(rows: Array<Array<unknown>>) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const matches = rows[rowIndex]
      .map((cell, columnIndex) => {
        const subject = subjectFromCell(cell);

        if (!subject) {
          return null;
        }

        return {
          columnIndex,
          subject,
        };
      })
      .filter((value): value is { columnIndex: number; subject: Subject } => Boolean(value));

    if (matches.length >= 2) {
      return {
        subjectRowIndex: rowIndex,
        subjectColumns: matches,
      };
    }
  }

  throw new Error("\uC8FC\uCC28 \uC2DC\uD2B8\uC5D0\uC11C \uACFC\uBAA9 \uBE14\uB85D\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
}

function findHeaderRowIndex(
  rows: Array<Array<unknown>>,
  subjectColumns: Array<{ columnIndex: number; subject: Subject }>,
  startRowIndex: number,
) {
  for (
    let rowIndex = startRowIndex + 1;
    rowIndex < Math.min(rows.length, startRowIndex + 8);
    rowIndex += 1
  ) {
    const count = subjectColumns.filter(({ columnIndex }) =>
      normalizeText(rows[rowIndex]?.[columnIndex]).includes("\uBC88\uD638"),
    ).length;

    if (count >= Math.max(1, Math.floor(subjectColumns.length / 2))) {
      return rowIndex;
    }
  }

  throw new Error("\uC8FC\uCC28 \uC2DC\uD2B8\uC5D0\uC11C \uC810\uC218 \uD5E4\uB354 \uD589\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
}

type ParsedAttendScore = {
  attendType: AttendType;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  note: string | null;
  skip?: boolean;
};

function parseAttendTypeAndScores(
  subject: Subject,
  rawValue: unknown,
  bonusValue: unknown,
  totalValue?: unknown,
): ParsedAttendScore | null {
  const rawText = toCellString(rawValue).trim();
  const bonusText = toCellString(bonusValue).trim();
  const totalText = toCellString(totalValue).trim();
  const combined = `${rawText}${bonusText}${totalText}`.replace(/\s+/g, "");

  if (!combined) {
    return null;
  }

  if (
    combined.includes("\uCC38\uC11D\uC131\uC801") ||
    combined.includes("\uCC38\uC11D")
  ) {
    return {
      attendType: AttendType.NORMAL,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: combined,
      skip: true,
    };
  }

  if (combined.includes("\uC0AC\uC720")) {
    return {
      attendType: AttendType.EXCUSED,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: "\uAE30\uC874 \uD1B5\uD569\uBCF8 \uC0AC\uC720 \uACB0\uC2DC",
    };
  }

  if (
    combined.includes("\uACB0\uC2DC") ||
    combined.includes("\uBD88\uCC38") ||
    combined.includes("\uBBF8\uC751\uC2DC")
  ) {
    return {
      attendType: AttendType.ABSENT,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: `\uAE30\uC874 \uD1B5\uD569\uBCF8 \uC0C1\uD0DC\uAC12 ${combined}`,
    };
  }

  const liveLike =
    rawText.includes("(\uB77C)") ||
    bonusText.includes("(\uB77C)") ||
    totalText.includes("(\uB77C)") ||
    combined.includes("\uB77C\uC774\uBE0C");

  if (liveLike) {
    const liveScore = parseNumericScore(totalValue) ?? parseNumericScore(rawValue);

    if (liveScore !== null) {
      return {
        attendType: AttendType.NORMAL,
        rawScore: liveScore,
        oxScore: null,
        finalScore: liveScore,
        note: combined,
      };
    }
  }

  const rawScore = parseNumericScore(rawValue);
  const bonusScore = parseNumericScore(bonusValue);
  const totalScore = parseNumericScore(totalValue);
  const oxScore = bonusScore;

  if (rawScore === null && bonusScore === null && totalScore !== null) {
    return {
      attendType: AttendType.NORMAL,
      rawScore: totalScore,
      oxScore: null,
      finalScore: totalScore,
      note: combined,
    };
  }

  if (rawScore === null && bonusScore === null) {
    return {
      attendType: AttendType.NORMAL,
      rawScore: null,
      oxScore: null,
      finalScore: null,
      note: combined,
    };
  }

  return {
    attendType: AttendType.NORMAL,
    rawScore,
    oxScore,
    finalScore: computeFinalScore(subject, rawScore, oxScore),
    note: null,
  };
}
function parseWeekNumber(sheetName: string) {
  const matched = sheetName.match(/(\d+)/);

  if (!matched) {
    throw new Error(`시트 이름에서 주차 번호를 찾을 수 없습니다. 시트명을 확인해 주세요. ${sheetName}`);
  }

  return Number(matched[1]);
}

function parseDayKey(value: unknown) {
  const parsedDate = parseExcelDate(value);

  if (parsedDate) {
    const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getUTCDate()).padStart(2, "0");
    return `${month}-${day}`;
  }

  const raw = toCellString(value);
  const matched = raw.match(/\d{1,2}/g);

  if (!matched || matched.length < 2 || raw.length > 20) {
    return null;
  }

  return `${matched[0]!.padStart(2, "0")}-${matched[1]!.padStart(2, "0")}`;
}

function resolveWeekDateMap(workbook: ReturnType<typeof readWorkbookFromBuffer>) {
  const summarySheetName =
    workbook.SheetNames[workbook.SheetNames.length - 2] ?? workbook.SheetNames[0];

  if (!summarySheetName) {
    return new Map<string, string>();
  }

  const rows = getSheetRows(workbook, summarySheetName) as Array<Array<unknown>>;
  const headerRowIndex = rows.findIndex(
    (row) => row.filter((value) => parseDayKey(value)).length >= 3,
  );

  if (headerRowIndex === -1) {
    return new Map<string, string>();
  }

  const dateRow = rows[headerRowIndex] ?? [];
  const subjectRow = rows[headerRowIndex + 1] ?? [];
  const datedColumns = dateRow.flatMap((value, index) =>
    parseDayKey(value) ? [index] : [],
  );

  if (datedColumns.length === 0) {
    return new Map<string, string>();
  }

  const blocks: number[][] = [];

  for (const columnIndex of datedColumns) {
    const lastBlock = blocks[blocks.length - 1];

    if (!lastBlock || columnIndex - lastBlock[lastBlock.length - 1]! > 5) {
      blocks.push([columnIndex]);
      continue;
    }

    lastBlock.push(columnIndex);
  }

  const weekDateMap = new Map<string, string>();

  blocks.forEach((columns, blockIndex) => {
    const localWeek = blockIndex + 1;

    for (const columnIndex of columns) {
      const subject = subjectFromCell(subjectRow[columnIndex]);
      const dayKey = parseDayKey(dateRow[columnIndex]);

      if (!subject || !dayKey) {
        continue;
      }

      weekDateMap.set(`${localWeek}:${subject}`, dayKey);
    }
  });

  return weekDateMap;
}

function findSheetDayKey(
  rows: Array<Array<unknown>>,
  subjectRowIndex: number,
  headerRowIndex: number,
  columnIndex: number,
) {
  for (let rowIndex = subjectRowIndex + 1; rowIndex < headerRowIndex; rowIndex += 1) {
    const dayKey = parseDayKey(rows[rowIndex]?.[columnIndex]);

    if (dayKey) {
      return dayKey;
    }
  }

  return null;
}

async function loadSessionMap(periodId: number, examType: ExamType) {
  const period = await getPrisma().examPeriod.findUniqueOrThrow({
    where: {
      id: periodId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId,
      examType,
    },
    select: {
      id: true,
      week: true,
      subject: true,
      examDate: true,
      isCancelled: true,
    },
  });

  const weekSessionMap = new Map(
    sessions.map((session) => [
      `${session.week}:${session.subject}`,
      {
        id: session.id,
        isCancelled: session.isCancelled,
        examDate: session.examDate.toISOString().slice(0, 10),
        label: `${session.week}주차 ${SUBJECT_LABEL[session.subject]} / ${session.examDate.toISOString().slice(0, 10)}`,
      },
    ]),
  );

  const daySessionMap = new Map(
    sessions.map((session) => [
      `${session.examDate.toISOString().slice(5, 10)}:${session.subject}`,
      {
        id: session.id,
        isCancelled: session.isCancelled,
        label: `${session.week}주차 ${SUBJECT_LABEL[session.subject]} / ${session.examDate.toISOString().slice(0, 10)}`,
      },
    ]),
  );

  return {
    period,
    weekSessionMap,
    daySessionMap,
  };
}
async function parseLegacyWorkbookRows(input: {
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  periodId: number;
  examType: ExamType;
}) {
  const workbook = readWorkbookFromBuffer(input.fileBuffer);
  const sheetNames = workbook.SheetNames;
  const weekSheetNames = sheetNames.filter((sheetName) => /^\d+\uC8FC\uCC28$/i.test(sheetName.trim()));

  if (weekSheetNames.length === 0) {
    throw new Error("\uC8FC\uCC28 \uC2DC\uD2B8\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAD6C\uAC04 \uD1B5\uD569\uBCF8 \uD30C\uC77C\uC778\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  }

  const { period, weekSessionMap, daySessionMap } = await loadSessionMap(
    input.periodId,
    input.examType,
  );
  const weekDateMap = resolveWeekDateMap(workbook);
  const rows: LegacyWorkbookParsedRow[] = [];

  for (const sheetName of weekSheetNames) {
    const week = parseWeekNumber(sheetName);
    const sheetRows = getSheetRows(workbook, sheetName);
    const { subjectRowIndex, subjectColumns } = findSubjectColumns(sheetRows as Array<Array<unknown>>);
    const headerRowIndex = findHeaderRowIndex(
      sheetRows as Array<Array<unknown>>,
      subjectColumns,
      subjectRowIndex,
    );

    for (let rowIndex = headerRowIndex + 1; rowIndex < sheetRows.length; rowIndex += 1) {
      const row = sheetRows[rowIndex] ?? [];

      for (const { columnIndex, subject } of subjectColumns) {
        const examNumber = normalizeExamNumber(row[columnIndex]);
        const name = toCellString(row[columnIndex + 1]).trim();
        const parsed = parseAttendTypeAndScores(
          subject,
          row[columnIndex + 2],
          row[columnIndex + 3],
          row[columnIndex + 4],
        );

        if ((!examNumber && !name) || parsed?.skip) {
          continue;
        }

        const dayKey =
          weekDateMap.get(`${week}:${subject}`) ??
          findSheetDayKey(
            sheetRows as Array<Array<unknown>>,
            subjectRowIndex,
            headerRowIndex,
            columnIndex,
          );
        const session =
          (dayKey ? daySessionMap.get(`${dayKey}:${subject}`) : null) ??
          weekSessionMap.get(`${week}:${subject}`);

        rows.push({
          rowKey: `${sheetName}:${subject}:${rowIndex + 1}:${examNumber || name || "empty"}`,
          sheetName,
          week,
          subject,
          dayKey,
          sessionId: session?.id ?? null,
          sessionLabel: session?.label ?? null,
          sessionExamDate:
            session && "examDate" in session && typeof session.examDate === "string"
              ? session.examDate
              : session?.label.match(/\d{4}-\d{2}-\d{2}$/)?.[0] ?? null,
          examNumber,
          name,
          rawScore: parsed?.rawScore ?? null,
          oxScore: parsed?.oxScore ?? null,
          finalScore: parsed?.finalScore ?? null,
          attendType: parsed?.attendType ?? AttendType.NORMAL,
          note: parsed?.note ?? null,
        });
      }
    }
  }

  return {
    fileName: input.fileName,
    period,
    sheetNames,
    rows,
  };
}

export async function previewLegacyWorkbookScores(input: {
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  periodId: number;
  examType: ExamType;
}) {
  const parsed = await parseLegacyWorkbookRows(input);
  const examNumbers = parsed.rows.map((row) => row.examNumber).filter(Boolean);
  const sessionIds = parsed.rows.map((row) => row.sessionId).filter((value): value is number => value !== null);
  const studentSet = new Set<string>();
  const existingScoreSet = new Set<string>();

  if (hasDatabaseConfig()) {
    const [students, existingScores] = await Promise.all([
      getPrisma().student.findMany({
        where: {
          examNumber: {
            in: examNumbers,
          },
        },
        select: {
          examNumber: true,
        },
      }),
      getPrisma().score.findMany({
        where: {
          sessionId: {
            in: sessionIds,
          },
          examNumber: {
            in: examNumbers,
          },
        },
        select: {
          sessionId: true,
          examNumber: true,
        },
      }),
    ]);

    students.forEach((student) => {
      studentSet.add(student.examNumber);
    });
    existingScores.forEach((score) => {
      existingScoreSet.add(`${score.sessionId}:${score.examNumber}`);
    });
  }

  const duplicateCount = new Map<string, number>();

  for (const row of parsed.rows) {
    if (!row.sessionId || !row.examNumber) {
      continue;
    }

    const key = `${row.sessionId}:${row.examNumber}`;
    duplicateCount.set(key, (duplicateCount.get(key) ?? 0) + 1);
  }

  const rows = parsed.rows.map((row) => {
    const issues: string[] = [];

    if (!row.sessionId) {
      issues.push("파일 결과와 대응되는 회차를 찾을 수 없습니다.");
    }

    if (!row.examNumber) {
      issues.push("수험번호를 입력해 주세요.");
    }

    if (row.sessionId && row.examNumber && (duplicateCount.get(`${row.sessionId}:${row.examNumber}`) ?? 0) > 1) {
      issues.push("같은 회차와 수험번호 조합이 중복되었습니다.");
    }

    if (row.examNumber && studentSet.size > 0 && !studentSet.has(row.examNumber)) {
      issues.push("학생 DB에 없는 수험번호입니다. 먼저 학생 데이터가 등록되어 있는지 확인해 주세요.");
    }

    if (
      row.attendType === AttendType.NORMAL &&
      row.rawScore === null &&
      row.oxScore === null &&
      row.finalScore === null
    ) {
      issues.push("점수 정보가 없습니다.");
    }

    const overwrite =
      row.sessionId !== null &&
      row.examNumber &&
      existingScoreSet.has(`${row.sessionId}:${row.examNumber}`);

    return {
      ...row,
      status: issues.length > 0 ? "invalid" : overwrite ? "overwrite" : "ready",
      issues,
    } satisfies LegacyWorkbookScorePreviewRow;
  });

  return {
    fileName: parsed.fileName,
    period: parsed.period,
    examType: input.examType,
    sheetNames: parsed.sheetNames,
    summary: {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.status === "ready").length,
      overwriteRows: rows.filter((row) => row.status === "overwrite").length,
      invalidRows: rows.filter((row) => row.status === "invalid").length,
      absentRows: rows.filter((row) => row.attendType === AttendType.ABSENT).length,
      excusedRows: rows.filter((row) => row.attendType === AttendType.EXCUSED).length,
      affectedSessions: new Set(rows.map((row) => row.sessionId).filter(Boolean)).size,
    },
    rows,
  } satisfies LegacyWorkbookScorePreview;
}

export async function executeLegacyWorkbookScores(input: {
  adminId: string;
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  periodId: number;
  examType: ExamType;
  ipAddress?: string | null;
}) {
  if (!hasDatabaseConfig()) {
    throw new Error("Database is not configured.");
  }

  const preview = await previewLegacyWorkbookScores(input);
  const validRows = preview.rows.filter((row) => row.status !== "invalid" && row.sessionId && row.examNumber);

  if (validRows.length === 0) {
    throw new Error("반영할 수 있는 점수 행이 없습니다. 파일 내용을 확인해 주세요.");
  }

  const prisma = getPrisma();

  const existingScores = await prisma.score.findMany({
    where: {
      sessionId: {
        in: validRows.map((row) => row.sessionId!),
      },
      examNumber: {
        in: validRows.map((row) => row.examNumber),
      },
    },
    select: {
      sessionId: true,
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      attendType: true,
      sourceType: true,
      note: true,
    },
  });
  const existingScoreMap = new Map(
    existingScores.map((score) => [`${score.sessionId}:${score.examNumber}`, score]),
  );
  const scoreWrites = dedupeScoreWriteRecords(
    validRows.flatMap((row) => {
      const nextWrite = {
        examNumber: row.examNumber,
        sessionId: row.sessionId!,
        rawScore: row.rawScore,
        oxScore: row.oxScore,
        finalScore: row.finalScore,
        attendType: row.attendType,
        sourceType: ScoreSource.MIGRATION,
        note: row.note,
      } satisfies ScoreWriteRecord;
      const existingScore = existingScoreMap.get(`${row.sessionId!}:${row.examNumber}`);

      if (hasSameScoreWrite(existingScore, nextWrite)) {
        return [];
      }

      return [nextWrite];
    }),
  );
  const createdCount = scoreWrites.filter(
    (row) => !existingScoreMap.has(`${row.sessionId}:${row.examNumber}`),
  ).length;
  const updatedCount = scoreWrites.length - createdCount;
  const affectedExamNumbers = Array.from(new Set(scoreWrites.map((row) => row.examNumber)));

  await bulkUpsertMigrationScores(prisma, scoreWrites);

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "MIGRATION_LEGACY_WORKBOOK_SCORES_EXECUTE",
      targetType: "LegacyWorkbookScoreMigration",
      targetId: `${input.periodId}:${input.examType}:${input.fileName}`,
      before: toAuditJson(null),
      after: toAuditJson({
        fileName: input.fileName,
        periodId: input.periodId,
        examType: input.examType,
        importedCount: scoreWrites.length,
        createdCount,
        updatedCount,
        invalidCount: preview.summary.invalidRows,
        absentCount: preview.summary.absentRows,
        excusedCount: preview.summary.excusedRows,
        affectedSessions: preview.summary.affectedSessions,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  if (affectedExamNumbers.length > 0) {
    await ensurePeriodEnrollments(
      input.periodId,
      affectedExamNumbers,
    );

    await recalculateStatusCache(input.periodId, input.examType, {
      examNumbers: affectedExamNumbers,
    });
  }

  return {
    preview,
    importedCount: scoreWrites.length,
    createdCount,
    updatedCount,
    invalidCount: preview.summary.invalidRows,
    affectedSessions: preview.summary.affectedSessions,
  };
}









