import { randomUUID } from "crypto";
import {
  ExamType,
  StudentType,
  type AuditLog,
  type Prisma,
  type Student,
} from "@prisma/client";
import {
  STUDENT_MIGRATION_FIELDS,
  type StudentMigrationFieldKey,
} from "@/lib/constants";
import {
  columnLabelFromIndex,
  getSheetRows,
  normalizePhone,
  parseExcelDate,
  readWorkbookFromBuffer,
  toCellString,
} from "@/lib/excel/workbook";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import {
  isPlaceholderStudentRecord,
  NON_PLACEHOLDER_STUDENT_FILTER,
} from "@/lib/students/placeholder";

const MIGRATION_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
} as const;

type StudentMapping = Partial<Record<StudentMigrationFieldKey, number>>;

export type StudentMigrationConfig = {
  fileName: string;
  fileBuffer: Buffer | ArrayBuffer;
  sheetName?: string;
  headerRowIndex?: number;
  mapping?: StudentMapping;
  defaults: {
    examType: ExamType;
    studentType: StudentType;
    classNameFallback?: string;
  };
};

export type StudentColumnOption = {
  index: number;
  letter: string;
  header: string;
  label: string;
  sample: string;
};

export type StudentPreviewRow = {
  rowNumber: number;
  status: "valid" | "invalid" | "update";
  issues: string[];
  record: StudentImportRecord;
};

export type StudentImportRecord = {
  examNumber: string;
  name: string;
  phone: string | null;
  generation: number | null;
  className: string | null;
  examType: ExamType;
  studentType: StudentType;
  onlineId: string | null;
  registeredAt: Date | null;
  note: string | null;
  isActive: boolean;
};

type PreparedStudentPreview = {
  sheetNames: string[];
  sheetName: string;
  headerRowIndex: number;
  columns: StudentColumnOption[];
  mapping: StudentMapping;
  previewRows: StudentPreviewRow[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    updateRows: number;
  };
};

type StudentSnapshot = Pick<
  Student,
  | "examNumber"
  | "name"
  | "phone"
  | "generation"
  | "className"
  | "examType"
  | "studentType"
  | "onlineId"
  | "registeredAt"
  | "note"
  | "isActive"
>;

const fieldSynonyms: Record<StudentMigrationFieldKey, string[]> = {
  examNumber: ["수험번호", "학번", "접수번호"],
  name: ["이름", "성명", "학생명"],
  phone: ["연락처", "전화번호", "휴대폰", "핸드폰"],
  generation: ["기수", "차수"],
  className: ["반", "반명", "강좌", "과정", "수강반"],
  registeredAt: ["등록일", "접수일", "수강등록일"],
  onlineId: ["온라인id", "수강생id", "아이디", "id"],
  note: ["메모", "비고", "노트"],
};

function normalizeHeaderValue(value: unknown) {
  return toCellString(value).replace(/\s+/g, "").toLowerCase();
}

function inferStudentSheetName(sheetNames: string[]) {
  return (
    sheetNames.find((sheetName) => {
      const normalized = sheetName.replace(/\s+/g, "").toLowerCase();
      return normalized.includes("수강생명단") && !normalized.includes("new");
    }) ??
    sheetNames.find((sheetName) => /수강생명단|student/i.test(sheetName.replace(/\s+/g, ""))) ??
    sheetNames[0]
  );
}

function inferHeaderRowIndex(rows: Array<Array<unknown>>) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const score = rows[index].reduce<number>((total, cell) => {
      const normalized = normalizeHeaderValue(cell);
      const matched = Object.values(fieldSynonyms).some((synonyms) =>
        synonyms.some((synonym) => normalized.includes(synonym.toLowerCase())),
      );

      return matched ? total + 1 : total;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}
function buildColumns(rows: Array<Array<unknown>>, headerRowIndex: number) {
  const headerRow = rows[headerRowIndex] ?? [];
  const maxLength = rows.reduce((length, row) => Math.max(length, row.length), 0);

  return Array.from({ length: maxLength }, (_, index) => {
    const header =
      toCellString(headerRow[index]) || `Column ${columnLabelFromIndex(index)}`;
    const sample =
      rows
        .slice(headerRowIndex + 1)
        .map((row) => toCellString(row[index]))
        .find(Boolean) ?? "";

    return {
      index,
      letter: columnLabelFromIndex(index),
      header,
      label: `${columnLabelFromIndex(index)} | ${header}`,
      sample,
    } satisfies StudentColumnOption;
  });
}

function inferMapping(columns: StudentColumnOption[]) {
  const mapping: StudentMapping = {};

  for (const field of STUDENT_MIGRATION_FIELDS) {
    const matchedColumn = columns.find((column) =>
      fieldSynonyms[field.key].some((synonym) =>
        normalizeHeaderValue(column.header).includes(synonym.toLowerCase()),
      ),
    );

    if (matchedColumn) {
      mapping[field.key] = matchedColumn.index;
    }
  }

  return mapping;
}

function normalizeExamNumber(value: unknown) {
  const raw = toCellString(value);

  if (!raw) {
    return "";
  }

  return raw.replace(/\.0$/, "");
}

function normalizeGeneration(value: unknown) {
  const raw = toCellString(value);

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildStudentRecord(
  row: Array<unknown>,
  mapping: StudentMapping,
  defaults: StudentMigrationConfig["defaults"],
) {
  const examNumber = normalizeExamNumber(
    mapping.examNumber !== undefined ? row[mapping.examNumber] : "",
  );
  const name = toCellString(mapping.name !== undefined ? row[mapping.name] : "");
  const classNameFromFile = toCellString(
    mapping.className !== undefined ? row[mapping.className] : "",
  );
  const onlineId = toCellString(
    mapping.onlineId !== undefined ? row[mapping.onlineId] : "",
  );
  const note = toCellString(mapping.note !== undefined ? row[mapping.note] : "");

  return {
    examNumber,
    name,
    phone: normalizePhone(mapping.phone !== undefined ? row[mapping.phone] : ""),
    generation:
      mapping.generation !== undefined
        ? normalizeGeneration(row[mapping.generation])
        : null,
    className: classNameFromFile || defaults.classNameFallback || null,
    examType: defaults.examType,
    studentType: defaults.studentType,
    onlineId: onlineId || null,
    registeredAt:
      mapping.registeredAt !== undefined
        ? parseExcelDate(row[mapping.registeredAt])
        : null,
    note: note || null,
    isActive: true,
  } satisfies StudentImportRecord;
}

function hasMeaningfulValues(record: StudentImportRecord) {
  return Boolean(record.examNumber || record.name || record.phone || record.onlineId);
}

function rowHasMappedValues(row: Array<unknown>, mapping: StudentMapping) {
  return Object.values(mapping).some((columnIndex) => {
    if (columnIndex === undefined) {
      return false;
    }

    return Boolean(toCellString(row[columnIndex]));
  });
}

async function loadExistingExamNumbers(examNumbers: string[]) {
  if (!hasDatabaseConfig() || examNumbers.length === 0) {
    return new Set<string>();
  }

  const students = await getPrisma().student.findMany({
    where: {
      AND: [
        NON_PLACEHOLDER_STUDENT_FILTER,
        {
          examNumber: {
            in: examNumbers,
          },
        },
      ],
    },
    select: {
      examNumber: true,
    },
  });

  return new Set(students.map((student) => student.examNumber));
}

export async function previewStudentMigration(config: StudentMigrationConfig) {
  const workbook = readWorkbookFromBuffer(config.fileBuffer);
  const sheetNames = workbook.SheetNames;
  const sheetName = config.sheetName ?? inferStudentSheetName(sheetNames);
  const rows = getSheetRows(workbook, sheetName);
  const headerRowIndex =
    config.headerRowIndex ?? inferHeaderRowIndex(rows as Array<Array<unknown>>);
  const columns = buildColumns(rows as Array<Array<unknown>>, headerRowIndex);
  const mapping =
    config.mapping && Object.keys(config.mapping).length > 0
      ? config.mapping
      : inferMapping(columns);

  const parsedRows = rows
    .slice(headerRowIndex + 1)
    .map((row, rowIndex) => ({
      rowNumber: headerRowIndex + rowIndex + 2,
      hasMappedValues: rowHasMappedValues(row, mapping),
      record: buildStudentRecord(row, mapping, config.defaults),
    }))
    .filter(({ hasMappedValues, record }) => hasMappedValues && hasMeaningfulValues(record));

  const duplicateCount = new Map<string, number>();

  for (const { record } of parsedRows) {
    if (!record.examNumber) {
      continue;
    }

    duplicateCount.set(
      record.examNumber,
      (duplicateCount.get(record.examNumber) ?? 0) + 1,
    );
  }

  const existingExamNumbers = await loadExistingExamNumbers(
    parsedRows.map(({ record }) => record.examNumber).filter(Boolean),
  );

  const previewRows: StudentPreviewRow[] = parsedRows.map(({ rowNumber, record }) => {
    const issues: string[] = [];
    const isPlaceholderRow = isPlaceholderStudentRecord(record);

    if (!record.examNumber) {
      issues.push("수험번호가 없습니다.");
    }

    if (!record.name) {
      issues.push("이름이 없습니다.");
    }

    if (isPlaceholderRow) {
      issues.push("헤더 행은 학생으로 가져올 수 없습니다.");
    }

    if (record.onlineId && !/^[A-Za-z0-9._@-]+$/.test(record.onlineId)) {
      issues.push("온라인 ID 형식을 확인해 주세요.");
    }

    if (
      record.examNumber &&
      (duplicateCount.get(record.examNumber) ?? 0) > 1
    ) {
      issues.push("파일 내 수험번호가 중복되었습니다.");
    }

    const isExisting = existingExamNumbers.has(record.examNumber);

    return {
      rowNumber,
      status:
        issues.length > 0 ? "invalid" : isExisting ? "update" : "valid",
      issues,
      record,
    };
  });

  const validRows = previewRows.filter((row) => row.status === "valid").length;
  const invalidRows = previewRows.filter((row) => row.status === "invalid").length;
  const updateRows = previewRows.filter((row) => row.status === "update").length;

  return {
    sheetNames,
    sheetName,
    headerRowIndex,
    columns,
    mapping,
    previewRows,
    summary: {
      totalRows: previewRows.length,
      validRows,
      invalidRows,
      updateRows,
    },
  } satisfies PreparedStudentPreview;
}

function serializeStudentSnapshot(student: Student): StudentSnapshot {
  return {
    examNumber: student.examNumber,
    name: student.name,
    phone: student.phone,
    generation: student.generation,
    className: student.className,
    examType: student.examType,
    studentType: student.studentType,
    onlineId: student.onlineId,
    registeredAt: student.registeredAt,
    note: student.note,
    isActive: student.isActive,
  };
}

function buildStudentWriteData(record: StudentImportRecord) {
  return {
    examNumber: record.examNumber,
    name: record.name,
    phone: record.phone,
    generation: record.generation,
    className: record.className,
    examType: record.examType,
    studentType: record.studentType,
    onlineId: record.onlineId,
    registeredAt: record.registeredAt,
    note: record.note,
    isActive: true,
  } satisfies Prisma.StudentUncheckedCreateInput;
}

export async function executeStudentMigration(
  config: StudentMigrationConfig & {
    adminId: string;
    ipAddress?: string | null;
  },
) {
  if (!hasDatabaseConfig()) {
    throw new Error("Database is not configured.");
  }

  const preview = await previewStudentMigration(config);
  const validRows = preview.previewRows.filter((row) => row.status !== "invalid");

  if (validRows.length === 0) {
    throw new Error("반영 가능한 행이 없습니다.");
  }

  const prisma = getPrisma();
  const batchId = randomUUID();

  return prisma.$transaction(
    async (tx) => {
      const examNumbers = validRows.map((row) => row.record.examNumber);
      const existingStudents = await tx.student.findMany({
        where: {
          examNumber: {
            in: examNumbers,
          },
        },
      });

      const existingMap = new Map(
        existingStudents.map((student) => [student.examNumber, student]),
      );
      const createdExamNumbers: string[] = [];
      const updatedSnapshots: StudentSnapshot[] = [];

      for (const row of validRows) {
        const existingStudent = existingMap.get(row.record.examNumber);

        if (existingStudent) {
          updatedSnapshots.push(serializeStudentSnapshot(existingStudent));
        } else {
          createdExamNumbers.push(row.record.examNumber);
        }

        const data = buildStudentWriteData(row.record);

        await tx.student.upsert({
          where: {
            examNumber: row.record.examNumber,
          },
          create: data,
          update: data,
        });
      }

      const auditLog = await tx.auditLog.create({
        data: {
          adminId: config.adminId,
          action: "MIGRATION_STUDENTS_EXECUTE",
          targetType: "StudentMigration",
          targetId: batchId,
          before: {
            updated: updatedSnapshots,
          },
          after: {
            fileName: config.fileName,
            sheetName: preview.sheetName,
            createdExamNumbers,
            importedCount: validRows.length,
            skippedCount: preview.summary.invalidRows,
            mapping: preview.mapping,
            defaults: config.defaults,
            summary: preview.summary,
          },
          ipAddress: config.ipAddress ?? null,
        },
      });

      return {
        batchId,
        auditLogId: auditLog.id,
        summary: preview.summary,
        importedCount: validRows.length,
        createdCount: createdExamNumbers.length,
        updatedCount: updatedSnapshots.length,
      };
    },
    MIGRATION_TRANSACTION_OPTIONS,
  );
}

function parseRollbackPayload(log: AuditLog) {
  const after = ((log.after ?? {}) as Prisma.JsonObject) ?? {};
  const before = ((log.before ?? {}) as Prisma.JsonObject) ?? {};

  const createdExamNumbers = Array.isArray(after.createdExamNumbers)
    ? after.createdExamNumbers.map((value) => String(value))
    : [];

  const updatedSnapshots = Array.isArray(before.updated)
    ? before.updated
        .map((value) => value as Prisma.JsonObject)
        .map((value) => ({
          examNumber: String(value.examNumber),
          name: String(value.name),
          phone: value.phone ? String(value.phone) : null,
          generation:
            typeof value.generation === "number"
              ? value.generation
              : value.generation
                ? Number(value.generation)
                : null,
          className: value.className ? String(value.className) : null,
          examType: value.examType as ExamType,
          studentType: value.studentType as StudentType,
          onlineId: value.onlineId ? String(value.onlineId) : null,
          registeredAt: value.registeredAt
            ? new Date(String(value.registeredAt))
            : null,
          note: value.note ? String(value.note) : null,
          isActive:
            typeof value.isActive === "boolean" ? value.isActive : true,
        }))
    : [];

  return {
    createdExamNumbers,
    updatedSnapshots,
  };
}

export async function rollbackStudentMigration(params: {
  auditLogId: number;
  adminId: string;
  ipAddress?: string | null;
}) {
  if (!hasDatabaseConfig()) {
    throw new Error("Database is not configured.");
  }

  const prisma = getPrisma();
  const targetLog = await prisma.auditLog.findUnique({
    where: {
      id: params.auditLogId,
    },
  });

  if (!targetLog || targetLog.action !== "MIGRATION_STUDENTS_EXECUTE") {
    throw new Error("롤백 가능한 학생 마이그레이션 이력이 없습니다.");
  }

  const payload = parseRollbackPayload(targetLog);

  return prisma.$transaction(async (tx) => {
    const existingRollback = await tx.auditLog.findFirst({
      where: {
        action: "MIGRATION_STUDENTS_ROLLBACK",
        targetId: String(targetLog.targetId),
      },
      select: {
        id: true,
      },
    });

    if (existingRollback) {
      throw new Error("이미 롤백된 학생 마이그레이션입니다.");
    }

    const skippedDeletes: string[] = [];
    let deletedCount = 0;

    if (payload.createdExamNumbers.length > 0) {
      const createdStudents = await tx.student.findMany({
        where: {
          examNumber: {
            in: payload.createdExamNumbers,
          },
        },
        select: {
          examNumber: true,
          _count: {
            select: {
              absenceNotes: true,
              counselingRecords: true,
              notifications: true,
              pointLogs: true,
              scores: true,
              studentAnswers: true,
              wrongNoteBookmarks: true,
              enrollments: true,
            },
          },
        },
      });

      for (const student of createdStudents) {
        const relatedCount = Object.values(student._count).reduce(
          (total, count) => total + count,
          0,
        );

        if (relatedCount > 0) {
          skippedDeletes.push(student.examNumber);
          continue;
        }

        await tx.student.delete({
          where: {
            examNumber: student.examNumber,
          },
        });

        deletedCount += 1;
      }
    }

    for (const snapshot of payload.updatedSnapshots) {
      await tx.student.update({
        where: {
          examNumber: snapshot.examNumber,
        },
        data: {
          name: snapshot.name,
          phone: snapshot.phone,
          generation: snapshot.generation,
          className: snapshot.className,
          examType: snapshot.examType,
          studentType: snapshot.studentType,
          onlineId: snapshot.onlineId,
          registeredAt: snapshot.registeredAt,
          note: snapshot.note,
          isActive: snapshot.isActive,
        },
      });
    }

    const rollbackLog = await tx.auditLog.create({
      data: {
        adminId: params.adminId,
        action: "MIGRATION_STUDENTS_ROLLBACK",
        targetType: "StudentMigration",
        targetId: String(targetLog.targetId),
        before: {
          sourceAuditLogId: targetLog.id,
        },
        after: {
          deletedCount,
          restoredCount: payload.updatedSnapshots.length,
          skippedDeletes,
        },
        ipAddress: params.ipAddress ?? null,
      },
    });

    return {
      rollbackAuditLogId: rollbackLog.id,
      deletedCount,
      restoredCount: payload.updatedSnapshots.length,
      skippedDeletes,
    };
  });
}




