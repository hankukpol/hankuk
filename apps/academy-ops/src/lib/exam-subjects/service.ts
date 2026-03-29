import { ExamType, Prisma, PrismaClient, Subject } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL, EXAM_TYPE_SUBJECTS, SUBJECT_LABEL } from "@/lib/constants";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ExamSubjectCatalogItem = {
  id: number | null;
  examType: ExamType;
  code: Subject;
  displayName: string;
  shortLabel: string;
  displayOrder: number;
  maxScore: number;
  isActive: boolean;
};

export type ExamSubjectCatalog = Record<ExamType, ExamSubjectCatalogItem[]>;

const DEFAULT_SHORT_LABEL: Record<Subject, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형소",
  POLICE_SCIENCE: "경학",
  CRIMINOLOGY: "범죄",
  CUMULATIVE: "누적",
};

function examTypeOrder(examType: ExamType) {
  return examType === ExamType.GONGCHAE ? 0 : 1;
}

function createEmptyCatalog(): ExamSubjectCatalog {
  return {
    [ExamType.GONGCHAE]: [],
    [ExamType.GYEONGCHAE]: [],
  };
}

export function buildFallbackExamSubjectCatalog(): ExamSubjectCatalog {
  const catalog = createEmptyCatalog();

  for (const examType of Object.values(ExamType)) {
    catalog[examType] = EXAM_TYPE_SUBJECTS[examType].map((code, index) => ({
      id: null,
      examType,
      code,
      displayName: SUBJECT_LABEL[code],
      shortLabel: DEFAULT_SHORT_LABEL[code],
      displayOrder: index + 1,
      maxScore: 100,
      isActive: true,
    }));
  }

  return catalog;
}

function toCatalog(rows: Array<{
  id: number;
  examType: ExamType;
  code: Subject;
  displayName: string;
  shortLabel: string;
  displayOrder: number;
  maxScore: number;
  isActive: boolean;
}>): ExamSubjectCatalog {
  const catalog = createEmptyCatalog();

  for (const row of rows) {
    catalog[row.examType].push({
      id: row.id,
      examType: row.examType,
      code: row.code,
      displayName: row.displayName,
      shortLabel: row.shortLabel,
      displayOrder: row.displayOrder,
      maxScore: row.maxScore,
      isActive: row.isActive,
    });
  }

  for (const examType of Object.values(ExamType)) {
    catalog[examType].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.displayName.localeCompare(right.displayName, "ko-KR"),
    );
  }

  return catalog;
}

function buildDefaultExamSubjectRows(academyId: number): Prisma.ExamSubjectCreateManyInput[] {
  const rows: Prisma.ExamSubjectCreateManyInput[] = [];

  for (const examType of Object.values(ExamType)) {
    for (const [index, code] of EXAM_TYPE_SUBJECTS[examType].entries()) {
      rows.push({
        academyId,
        examType,
        code,
        displayName: SUBJECT_LABEL[code],
        shortLabel: DEFAULT_SHORT_LABEL[code],
        displayOrder: index + 1,
        maxScore: 100,
        isActive: true,
      });
    }
  }

  return rows;
}

export async function hydrateDefaultExamSubjectsForAcademy(
  academyId: number,
  db: DbClient = getPrisma(),
) {
  await db.examSubject.createMany({
    data: buildDefaultExamSubjectRows(academyId),
    skipDuplicates: true,
  });
}

export async function listExamSubjectsForAcademy(
  academyId: number,
  options?: {
    examType?: ExamType;
    includeInactive?: boolean;
  },
  db: DbClient = getPrisma(),
) {
  await hydrateDefaultExamSubjectsForAcademy(academyId, db);

  return db.examSubject.findMany({
    where: {
      academyId,
      examType: options?.examType,
      ...(options?.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [
      { examType: "asc" },
      { displayOrder: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
}

export async function listExamSubjectCatalogForAcademy(
  academyId: number,
  options?: { includeInactive?: boolean },
  db: DbClient = getPrisma(),
) {
  const rows = await listExamSubjectsForAcademy(academyId, { includeInactive: options?.includeInactive }, db);
  return toCatalog(rows);
}

export async function getExamSubjectByCode(
  academyId: number,
  examType: ExamType,
  code: Subject,
  options?: { includeInactive?: boolean },
  db: DbClient = getPrisma(),
) {
  await hydrateDefaultExamSubjectsForAcademy(academyId, db);

  return db.examSubject.findFirst({
    where: {
      academyId,
      examType,
      code,
      ...(options?.includeInactive ? {} : { isActive: true }),
    },
  });
}

export async function requireExamSubjectByCode(
  academyId: number,
  examType: ExamType,
  code: Subject,
  db: DbClient = getPrisma(),
) {
  const subject = await getExamSubjectByCode(academyId, examType, code, undefined, db);

  if (!subject) {
    throw new Error(`선택한 직렬(${EXAM_TYPE_LABEL[examType]})에서 사용할 수 없는 과목입니다.`);
  }

  return subject;
}

export function buildExamSubjectLabelMap(catalog: ExamSubjectCatalog) {
  const map: Record<string, string> = {};

  for (const examType of Object.values(ExamType)) {
    for (const row of catalog[examType]) {
      map[row.code] = row.displayName;
    }
  }

  return map;
}

export function buildExamSubjectOptions(catalog: ExamSubjectCatalog, examType: ExamType) {
  return catalog[examType].map((row) => ({
    value: row.code,
    label: row.displayName,
    shortLabel: row.shortLabel,
    maxScore: row.maxScore,
  }));
}

export function buildFlatExamSubjectOptions(catalog: ExamSubjectCatalog) {
  const seen = new Set<string>();
  const items: Array<{ key: string; label: string }> = [];

  for (const examType of Object.values(ExamType).sort((left, right) => examTypeOrder(left) - examTypeOrder(right))) {
    for (const row of catalog[examType]) {
      const dedupeKey = `${row.code}:${row.displayName}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      items.push({ key: row.code, label: row.displayName });
    }
  }

  return items;
}

export function parseExamSubjectCreateInput(raw: Record<string, unknown>) {
  const examType = String(raw.examType ?? "").trim() as ExamType;
  const code = String(raw.code ?? "").trim() as Subject;
  const displayName = String(raw.displayName ?? "").trim();
  const shortLabel = String(raw.shortLabel ?? "").trim();
  const displayOrder = Number(raw.displayOrder ?? 0);
  const maxScore = Number(raw.maxScore ?? 100);
  const isActive = raw.isActive === undefined ? true : Boolean(raw.isActive);

  if (!Object.values(ExamType).includes(examType)) {
    throw new Error("직렬을 올바르게 선택해 주세요.");
  }

  if (!Object.values(Subject).includes(code)) {
    throw new Error("과목 코드를 올바르게 선택해 주세요.");
  }

  if (!displayName) {
    throw new Error("과목명을 입력해 주세요.");
  }

  if (!shortLabel) {
    throw new Error("과목 약어를 입력해 주세요.");
  }

  if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > 99) {
    throw new Error("표시 순서는 1부터 99 사이 정수로 입력해 주세요.");
  }

  if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 1000) {
    throw new Error("만점 기준은 1부터 1000 사이 정수로 입력해 주세요.");
  }

  return {
    examType,
    code,
    displayName,
    shortLabel,
    displayOrder,
    maxScore,
    isActive,
  };
}

export function parseExamSubjectUpdateInput(raw: Record<string, unknown>) {
  const payload: {
    displayName?: string;
    shortLabel?: string;
    displayOrder?: number;
    maxScore?: number;
    isActive?: boolean;
  } = {};

  if (raw.displayName !== undefined) {
    const displayName = String(raw.displayName ?? "").trim();
    if (!displayName) {
      throw new Error("과목명을 입력해 주세요.");
    }
    payload.displayName = displayName;
  }

  if (raw.shortLabel !== undefined) {
    const shortLabel = String(raw.shortLabel ?? "").trim();
    if (!shortLabel) {
      throw new Error("과목 약어를 입력해 주세요.");
    }
    payload.shortLabel = shortLabel;
  }

  if (raw.displayOrder !== undefined) {
    const displayOrder = Number(raw.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > 99) {
      throw new Error("표시 순서는 1부터 99 사이 정수로 입력해 주세요.");
    }
    payload.displayOrder = displayOrder;
  }

  if (raw.maxScore !== undefined) {
    const maxScore = Number(raw.maxScore);
    if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 1000) {
      throw new Error("만점 기준은 1부터 1000 사이 정수로 입력해 주세요.");
    }
    payload.maxScore = maxScore;
  }

  if (raw.isActive !== undefined) {
    payload.isActive = Boolean(raw.isActive);
  }

  return payload;
}
