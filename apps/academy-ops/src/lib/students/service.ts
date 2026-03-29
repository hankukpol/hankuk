import { Prisma } from "@prisma/client";
import { AbsenceStatus, AttendType, ExamType, StudentType } from "@prisma/client";
import {
  DUPLICATE_STRATEGY_LABEL,
  EXAM_TYPE_VALUES,
  STUDENT_TYPE_VALUES,
  type StudentPasteFieldKey,
} from "@/lib/constants";
import { toAuditJson } from "@/lib/audit";
import { normalizePhone, parseExcelDate, toCellString } from "@/lib/excel/workbook";
import { withAbsenceNoteDisplay } from "@/lib/absence-notes/system-note";
import { applyAcademyScope, getAdminAcademyScope, requireVisibleAcademyId, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";
import {
  previewStudentMigration,
  type StudentImportRecord,
  type StudentPreviewRow,
} from "@/lib/migration/students";
import {
  isPlaceholderStudentRecord,
  NON_PLACEHOLDER_STUDENT_FILTER,
} from "@/lib/students/placeholder";

export type StudentFilters = {
  examType?: ExamType;
  search?: string;
  generation?: number;
  activeOnly?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  sort?: 'name' | 'examNumber' | 'registeredAt';
  sortDir?: 'asc' | 'desc';
};

export type StudentFormInput = {
  examNumber: string;
  name: string;
  phone?: string | null;
  birthDate?: Date | null;
  generation?: number | null;
  className?: string | null;
  examType: ExamType;
  studentType: StudentType;
  onlineId?: string | null;
  registeredAt?: Date | null;
  note?: string | null;
};

export type DuplicateStrategy = keyof typeof DUPLICATE_STRATEGY_LABEL;

type PasteDefaults = {
  examType: ExamType;
  studentType: StudentType;
  duplicateStrategy: DuplicateStrategy;
  classNameFallback?: string;
};

type PasteMapping = Partial<Record<StudentPasteFieldKey, number>>;

const STUDENT_IMPORT_UPDATE_BATCH_SIZE = 25;
async function resolveVisibleStudentAcademyId() {
  const scope = await getAdminAcademyScope();
  return resolveVisibleAcademyId(scope);
}

async function requireStudentWriteAcademyId() {
  const scope = await getAdminAcademyScope();
  return requireVisibleAcademyId(scope);
}

function endOfToday() {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

function buildSessionScoreCountMap(rows: Array<{ sessionId: number }>) {
  const counts = new Map<number, number>();

  for (const row of rows) {
    counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
  }

  return counts;
}

function buildStudentListWhere(filters: StudentFilters, academyId: number | null): Prisma.StudentWhereInput {
  const search = filters.search?.trim();

  return {
    AND: [
      NON_PLACEHOLDER_STUDENT_FILTER,
      {
        ...applyAcademyScope({}, academyId),
        examType: filters.examType,
        generation: filters.generation,
        isActive: filters.activeOnly === false ? undefined : true,
        OR: search
          ? [
              {
                examNumber: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ]
          : undefined,
      },
    ],
  };
}

export async function listStudents(filters: StudentFilters) {
  const academyId = await resolveVisibleStudentAcademyId();

  return getPrisma().student.findMany({
    where: buildStudentListWhere(filters, academyId),
    orderBy: [{ isActive: "desc" }, { generation: "desc" }, { examNumber: "asc" }],
    take: filters.limit,
    include: {
      _count: {
        select: {
          scores: true,
        },
      },
    },
  });
}

export async function listStudentsPage(filters: StudentFilters) {
  const prisma = getPrisma();
  const academyId = await resolveVisibleStudentAcademyId();
  const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);
  const requestedPage = Math.max(filters.page ?? 1, 1);
  const where = buildStudentListWhere(filters, academyId);
  const { sort, sortDir } = filters;

  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sort === 'name'
      ? [{ name: sortDir ?? 'asc' }]
      : sort === 'examNumber'
        ? [{ examNumber: sortDir ?? 'asc' }]
        : [{ registeredAt: sortDir === 'asc' ? 'asc' : 'desc' }];

  const totalCount = await prisma.student.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const students = await prisma.student.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      _count: {
        select: {
          scores: true,
        },
      },
    },
  });

  return {
    page,
    pageSize,
    totalCount,
    students,
  };
}

export async function getStudentHistory(examNumber: string) {
  const prisma = getPrisma();
  const academyId = await resolveVisibleStudentAcademyId();
  const student = await prisma.student.findFirst({
    where: academyId === null ? { examNumber } : { examNumber, academyId },
    include: {
      enrollments: {
        select: {
          periodId: true,
        },
      },
      scores: {
        include: {
          session: {
            include: {
              period: true,
            },
          },
        },
        orderBy: {
          session: {
            examDate: "desc",
          },
        },
      },
      absenceNotes: {
        where: {
          status: AbsenceStatus.APPROVED,
        },
        include: {
          session: {
            include: {
              period: true,
            },
          },
        },
        orderBy: {
          session: {
            examDate: "desc",
          },
        },
      },
    },
  });

  if (!student) {
    return null;
  }

  const periodIds = Array.from(
    new Set([
      ...student.enrollments.map((enrollment) => enrollment.periodId),
      ...student.scores.map((score) => score.session.periodId),
      ...student.absenceNotes.map((absence) => absence.session.periodId),
    ]),
  );

  const scoreRows = student.scores.map((score) => ({
    ...withAbsenceNoteDisplay(score),
    isVirtual: false,
  }));

  if (periodIds.length === 0) {
    return {
      ...student,
      scores: scoreRows,
    };
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: {
        in: periodIds,
      },
      period: {
        academyId: student.academyId,
      },
      examType: student.examType,
      isCancelled: false,
    },
    include: {
      period: true,
    },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
  });
  const sessionIds = sessions.map((session) => session.id);
  const sessionScoreCounts =
    sessionIds.length > 0
      ? buildSessionScoreCountMap(
          await prisma.score.findMany({
            where: {
              sessionId: {
                in: sessionIds,
              },
              academyId: student.academyId,
            },
            select: {
              sessionId: true,
            },
          }),
        )
      : new Map<number, number>();
  const scoreRowsBySessionId = new Map(scoreRows.map((score) => [score.sessionId, score]));
  const approvedAbsenceBySessionId = new Map(
    student.absenceNotes.map((absence) => [absence.sessionId, absence]),
  );
  const today = endOfToday();
  const virtualRows = sessions.flatMap((session) => {
    if (scoreRowsBySessionId.has(session.id)) {
      return [];
    }

    const approvedAbsence = approvedAbsenceBySessionId.get(session.id) ?? null;
    const isOccurred = session.examDate <= today;
    const isPendingInput = isOccurred && (sessionScoreCounts.get(session.id) ?? 0) === 0;
    const inferredAbsent = isOccurred && !isPendingInput && !approvedAbsence;

    if (!approvedAbsence && !inferredAbsent) {
      return [];
    }

    return [
      {
        id: -session.id,
        examNumber: student.examNumber,
        sessionId: session.id,
        rawScore: null,
        oxScore: null,
        finalScore: null,
        attendType: approvedAbsence ? AttendType.EXCUSED : AttendType.ABSENT,
        note: approvedAbsence?.reason ?? null,
        rawNote: approvedAbsence?.reason ?? null,
        sourceType: null,
        isVirtual: true,
        session,
      },
    ];
  });
  const historyRows = [...scoreRows, ...virtualRows].sort(
    (left, right) =>
      right.session.examDate.getTime() - left.session.examDate.getTime() ||
      right.session.id - left.session.id,
  );

  return {
    ...student,
    scores: historyRows,
  };
}

function studentData(input: StudentFormInput, academyId: number) {
  return {
    examNumber: input.examNumber,
    name: input.name,
    phone: input.phone ?? null,
    birthDate: input.birthDate ?? null,
    generation: input.generation ?? null,
    className: input.className ?? null,
    examType: input.examType,
    studentType: input.studentType,
    onlineId: input.onlineId ?? null,
    registeredAt: input.registeredAt ?? null,
    academyId,
    note: input.note ?? null,
  } satisfies Prisma.StudentUncheckedCreateInput;
}

async function runPrismaWriteBatches(
  prisma: ReturnType<typeof getPrisma>,
  operations: Array<Prisma.PrismaPromise<unknown>>,
) {
  for (let index = 0; index < operations.length; index += STUDENT_IMPORT_UPDATE_BATCH_SIZE) {
    await prisma.$transaction(operations.slice(index, index + STUDENT_IMPORT_UPDATE_BATCH_SIZE));
  }
}

export async function createStudent(input: {
  adminId: string;
  student: StudentFormInput;
  ipAddress?: string | null;
}) {
  const academyId = await requireStudentWriteAcademyId();

  const student = await getPrisma().$transaction(async (tx) => {
    const student = await tx.student.create({
      data: studentData(input.student, academyId),
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_CREATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(null),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function updateStudent(input: {
  adminId: string;
  examNumber: string;
  student: StudentFormInput;
  ipAddress?: string | null;
}) {
  const academyId = await requireStudentWriteAcademyId();

  const student = await getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findFirstOrThrow({
      where: {
        examNumber: input.examNumber,
        academyId,
      },
    });

    const student = await tx.student.update({
      where: {
        examNumber: input.examNumber,
      },
      data: studentData(input.student, academyId),
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_UPDATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function deactivateStudent(input: {
  adminId: string;
  examNumber: string;
  ipAddress?: string | null;
}) {
  const academyId = await requireStudentWriteAcademyId();

  const student = await getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findFirstOrThrow({
      where: {
        examNumber: input.examNumber,
        academyId,
      },
    });

    const student = await tx.student.update({
      where: {
        examNumber: input.examNumber,
      },
      data: {
        isActive: false,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_DEACTIVATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function reactivateStudent(input: {
  adminId: string;
  examNumber: string;
  ipAddress?: string | null;
}) {
  const academyId = await requireStudentWriteAcademyId();

  const student = await getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findFirstOrThrow({
      where: { examNumber: input.examNumber, academyId },
    });

    const student = await tx.student.update({
      where: { examNumber: input.examNumber },
      data: { isActive: true },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_REACTIVATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return student;
}

export async function bulkDeactivateStudents(input: {
  adminId: string;
  examNumbers: string[];
  ipAddress?: string | null;
}) {
  if (input.examNumbers.length === 0) {
    throw new Error("비활성화할 수강생을 선택해 주세요.");
  }

  const academyId = await requireStudentWriteAcademyId();
  const result = await getPrisma().$transaction(async (tx) => {
    const targets = await tx.student.findMany({
      where: {
        AND: [
          NON_PLACEHOLDER_STUDENT_FILTER,
          {
            academyId,
            examNumber: {
              in: input.examNumbers,
            },
          },
        ],
      },
      select: {
        examNumber: true,
        name: true,
        isActive: true,
        generation: true,
      },
    });

    const foundExamNumbers = new Set(targets.map((target) => target.examNumber));
    const missingExamNumbers = input.examNumbers.filter((examNumber) => !foundExamNumbers.has(examNumber));
    const updatableTargets = targets.filter((target) => target.isActive);
    const skippedCount = targets.length - updatableTargets.length;

    if (updatableTargets.length > 0) {
      await tx.student.updateMany({
        where: {
          academyId,
          examNumber: {
            in: updatableTargets.map((target) => target.examNumber),
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_BULK_DEACTIVATE",
        targetType: "Student",
        targetId: "bulk",
        before: toAuditJson(targets),
        after: toAuditJson({
          updatedCount: updatableTargets.length,
          skippedCount,
          missingExamNumbers,
          examNumbers: updatableTargets.map((target) => target.examNumber),
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      updatedCount: updatableTargets.length,
      skippedCount,
      missingExamNumbers,
    };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}

export async function bulkUpdateStudentGeneration(input: {
  adminId: string;
  examNumbers: string[];
  generation: number | null;
  ipAddress?: string | null;
}) {
  if (input.examNumbers.length === 0) {
    throw new Error("기수를 변경할 수강생을 선택해 주세요.");
  }

  const academyId = await requireStudentWriteAcademyId();
  const result = await getPrisma().$transaction(async (tx) => {
    const targets = await tx.student.findMany({
      where: {
        AND: [
          NON_PLACEHOLDER_STUDENT_FILTER,
          {
            academyId,
            examNumber: {
              in: input.examNumbers,
            },
          },
        ],
      },
      select: {
        examNumber: true,
        name: true,
        generation: true,
        isActive: true,
      },
    });

    const foundExamNumbers = new Set(targets.map((target) => target.examNumber));
    const missingExamNumbers = input.examNumbers.filter((examNumber) => !foundExamNumbers.has(examNumber));
    const updatableTargets = targets.filter((target) => target.generation !== input.generation);
    const skippedCount = targets.length - updatableTargets.length;

    if (updatableTargets.length > 0) {
      await tx.student.updateMany({
        where: {
          academyId,
          examNumber: {
            in: updatableTargets.map((target) => target.examNumber),
          },
        },
        data: {
          generation: input.generation,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_BULK_GENERATION_UPDATE",
        targetType: "Student",
        targetId: "bulk",
        before: toAuditJson(targets),
        after: toAuditJson({
          updatedCount: updatableTargets.length,
          skippedCount,
          missingExamNumbers,
          generation: input.generation,
          examNumbers: updatableTargets.map((target) => target.examNumber),
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      updatedCount: updatableTargets.length,
      skippedCount,
      missingExamNumbers,
      generation: input.generation,
    };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}

export function parseStudentForm(raw: Record<string, unknown>) {
  const examNumber = String(raw.examNumber ?? "").trim();
  const name = String(raw.name ?? "").trim();
  const phone = normalizePhone(raw.phone ?? "");

  if (!examNumber) {
    throw new Error("수험번호를 입력해 주세요.");
  }

  if (!name) {
    throw new Error("이름을 입력해 주세요.");
  }

  if (isPlaceholderStudentRecord({ examNumber, name, phone })) {
    throw new Error("샘플 또는 빈 학생 정보로는 등록할 수 없습니다.");
  }

  const generationRaw = String(raw.generation ?? "").trim();
  const registeredAtRaw = String(raw.registeredAt ?? "").trim();
  const birthDateRaw = String(raw.birthDate ?? "").trim();
  const generation = generationRaw ? Number(generationRaw) : null;
  const registeredAt = registeredAtRaw ? new Date(registeredAtRaw) : null;
  const birthDate = birthDateRaw ? new Date(birthDateRaw) : null;
  const examType = String(raw.examType ?? "").trim() as ExamType;
  const studentType = String(raw.studentType ?? "").trim() as StudentType;

  if (generationRaw && Number.isNaN(generation)) {
    throw new Error("기수는 숫자로 입력해 주세요.");
  }

  if (registeredAt && Number.isNaN(registeredAt.getTime())) {
    throw new Error("등록일 형식이 올바르지 않습니다.");
  }

  if (birthDate && Number.isNaN(birthDate.getTime())) {
    throw new Error("생년월일 형식이 올바르지 않습니다.");
  }

  if (!EXAM_TYPE_VALUES.includes(examType)) {
    throw new Error("시험 유형이 올바르지 않습니다.");
  }

  if (!STUDENT_TYPE_VALUES.includes(studentType)) {
    throw new Error("학생 구분이 올바르지 않습니다.");
  }

  return {
    examNumber,
    name,
    phone,
    birthDate,
    generation,
    className: String(raw.className ?? "").trim() || null,
    examType,
    studentType,
    onlineId: String(raw.onlineId ?? "").trim() || null,
    registeredAt,
    note: String(raw.note ?? "").trim() || null,
  } satisfies StudentFormInput;
}

function buildPasteRecord(
  values: string[],
  mapping: PasteMapping,
  defaults: PasteDefaults,
) {
  const examNumber = toCellString(values[mapping.examNumber ?? -1]).replace(/\.0$/, "");
  const name = toCellString(values[mapping.name ?? -1]);
  const className =
    toCellString(values[mapping.className ?? -1]) || defaults.classNameFallback || "";
  const generationRaw = toCellString(values[mapping.generation ?? -1]);

  return {
    examNumber,
    name,
    phone: normalizePhone(values[mapping.phone ?? -1]),
    generation: generationRaw ? Number.parseInt(generationRaw, 10) : null,
    className: className || null,
    examType: defaults.examType,
    studentType: defaults.studentType,
    onlineId: null,
    registeredAt: parseExcelDate(values[mapping.registeredAt ?? -1]),
    note: null,
    isActive: true,
  } satisfies StudentImportRecord;
}

function hasPasteValues(record: StudentImportRecord) {
  return Boolean(record.examNumber || record.name || record.phone);
}

async function buildPreviewRows(
  records: Array<{ rowNumber: number; record: StudentImportRecord }>,
  academyId: number,
) {
  const examNumbers = records.map((item) => item.record.examNumber).filter(Boolean);
  const existing = await getPrisma().student.findMany({
    where: {
      AND: [
        NON_PLACEHOLDER_STUDENT_FILTER,
        {
          academyId,
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
  const existingSet = new Set(existing.map((student) => student.examNumber));
  const duplicateMap = new Map<string, number>();

  for (const item of records) {
    if (item.record.examNumber) {
      duplicateMap.set(
        item.record.examNumber,
        (duplicateMap.get(item.record.examNumber) ?? 0) + 1,
      );
    }
  }

  const previewRows: StudentPreviewRow[] = records.map(({ rowNumber, record }) => {
    const issues: string[] = [];
    const isPlaceholderRow = isPlaceholderStudentRecord(record);

    if (!record.examNumber) {
      issues.push("수험번호가 없습니다.");
    }

    if (!record.name) {
      issues.push("이름이 없습니다.");
    }

    if (isPlaceholderRow) {
      issues.push("샘플 또는 빈 학생 정보로는 등록할 수 없습니다.");
    }

    if (
      record.examNumber &&
      (duplicateMap.get(record.examNumber) ?? 0) > 1
    ) {
      issues.push("입력 내 수험번호가 중복되었습니다.");
    }

    return {
      rowNumber,
      issues,
      record,
      status:
        issues.length > 0
          ? "invalid"
          : existingSet.has(record.examNumber)
            ? "update"
            : "valid",
    };
  });

  return previewRows;
}

export async function previewStudentPasteImport(input: {
  text?: string;
  mapping: PasteMapping;
  defaults: PasteDefaults;
}) {
  const rows = (input.text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.split("	"));

  const records = rows
    .map((values, index) => ({
      rowNumber: index + 1,
      record: buildPasteRecord(values, input.mapping, input.defaults),
    }))
    .filter(({ record }) => hasPasteValues(record));

  const academyId = await requireStudentWriteAcademyId();
  const previewRows = await buildPreviewRows(records, academyId);

  return {
    previewRows,
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status === "invalid").length,
      updateRows: previewRows.filter((row) => row.status === "update").length,
    },
  };
}

async function executeStudentRecords(input: {
  adminId: string;
  rows: StudentPreviewRow[];
  duplicateStrategy: DuplicateStrategy;
  ipAddress?: string | null;
}) {
  const academyId = await requireStudentWriteAcademyId();
  const prisma = getPrisma();
  const validRows = input.rows.filter((row) => row.status !== "invalid");
  const newRows = validRows.filter((row) => row.status === "valid");
  const updateRows = validRows.filter((row) => row.status === "update");

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  if (newRows.length > 0) {
    await prisma.student.createMany({
      data: newRows.map((row) => studentData(row.record, academyId)),
      skipDuplicates: true,
    });
    createdCount = newRows.length;
  }

  if (updateRows.length > 0) {
    if (input.duplicateStrategy === "SKIP") {
      skippedCount = updateRows.length;
    } else {
      const existingMap = input.duplicateStrategy === "UPDATE"
        ? new Map(
            (await prisma.student.findMany({
              where: {
                academyId,
                examNumber: { in: updateRows.map((row) => row.record.examNumber) },
              },
              select: {
                examNumber: true,
                name: true,
                phone: true,
                generation: true,
                className: true,
                onlineId: true,
                registeredAt: true,
                note: true,
              },
            })).map((student) => [student.examNumber, student]),
          )
        : new Map();

      const updateOperations = updateRows.map((row) => {
        const existing = existingMap.get(row.record.examNumber);
        const updateData =
          input.duplicateStrategy === "OVERWRITE" || !existing
            ? studentData(row.record, academyId)
            : {
                name: row.record.name || existing.name,
                phone: row.record.phone ?? existing.phone,
                generation: row.record.generation ?? existing.generation,
                className: row.record.className ?? existing.className,
                examType: row.record.examType,
                studentType: row.record.studentType,
                onlineId: row.record.onlineId ?? existing.onlineId,
                registeredAt: row.record.registeredAt ?? existing.registeredAt,
                note: row.record.note ?? existing.note,
              };

        return prisma.student.update({
          where: { examNumber: row.record.examNumber },
          data: updateData,
        });
      });

      await runPrismaWriteBatches(prisma, updateOperations);
      updatedCount = updateRows.length;
    }
  }

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "STUDENT_PASTE_IMPORT",
      targetType: "Student",
      targetId: "bulk",
      before: toAuditJson(null),
      after: toAuditJson({
        duplicateStrategy: input.duplicateStrategy,
        createdCount,
        updatedCount,
        skippedCount,
        importedCount: validRows.length,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return {
    importedCount: validRows.length,
    createdCount,
    updatedCount,
    skippedCount,
  };
}

export async function executeStudentPasteImport(input: {
  adminId: string;
  text?: string;
  mapping: PasteMapping;
  defaults: PasteDefaults;
  ipAddress?: string | null;
}) {
  const preview = await previewStudentPasteImport(input);
  return executeStudentRecords({
    adminId: input.adminId,
    rows: preview.previewRows,
    duplicateStrategy: input.defaults.duplicateStrategy,
    ipAddress: input.ipAddress,
  });
}

export async function previewStudentFileImport(input: {
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  defaults: Omit<PasteDefaults, "duplicateStrategy">;
}) {
  const academyId = await requireStudentWriteAcademyId();
  const preview = await previewStudentMigration({
    fileName: input.fileName,
    fileBuffer: input.buffer,
    defaults: input.defaults,
  });
  const previewRows = await buildPreviewRows(
    preview.previewRows.map((row) => ({ rowNumber: row.rowNumber, record: row.record })),
    academyId,
  );

  return {
    ...preview,
    previewRows,
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.filter((row) => row.status === "valid").length,
      invalidRows: previewRows.filter((row) => row.status === "invalid").length,
      updateRows: previewRows.filter((row) => row.status === "update").length,
    },
  };
}

export async function executeStudentFileImport(input: {
  adminId: string;
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  defaults: PasteDefaults;
  ipAddress?: string | null;
}) {
  const preview = await previewStudentFileImport({
    fileName: input.fileName,
    buffer: input.buffer,
    defaults: input.defaults,
  });

  return executeStudentRecords({
    adminId: input.adminId,
    rows: preview.previewRows,
    duplicateStrategy: input.defaults.duplicateStrategy,
    ipAddress: input.ipAddress,
  });
}
