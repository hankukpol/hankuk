import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType, ScoreSource, StudentType } from "@prisma/client";
import { executeLegacyWorkbookScores, previewLegacyWorkbookScores } from "../src/lib/migration/scores";
import { getPrisma } from "../src/lib/prisma";

type WorkbookTarget = {
  fileName: string;
  examType: ExamType;
};

type Candidate = {
  examNumber: string;
  name: string;
  examType: ExamType;
  sources: string[];
};

type ScriptMode = "full" | "create-students" | "rerun" | "report";

const PERIOD_ID = 1;
const DEFAULT_NOTE = "Created from score migration cleanup 2026-03-08";
const WORKBOOKS: WorkbookTarget[] = [
  { fileName: "1월 아침모의고사 기본이론반_경행경채.xlsx", examType: ExamType.GONGCHAE },
  { fileName: "1월 아침모의고사 기본이론반_전체성적.xlsx", examType: ExamType.GONGCHAE },
  { fileName: "2월 아침모의고사 기본이론반_경행경채.xlsx", examType: ExamType.GONGCHAE },
  { fileName: "2월 아침모의고사 기본이론반_전체성적.xlsx", examType: ExamType.GONGCHAE },
];

function getArg(name: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function getMode(): ScriptMode {
  const mode = getArg("mode");
  if (mode === "create-students" || mode === "rerun" || mode === "report") {
    return mode;
  }
  return "full";
}

function getWorkbookIndexes() {
  const raw = getArg("indexes");
  if (!raw) {
    return WORKBOOKS.map((_, index) => index);
  }

  return raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < WORKBOOKS.length);
}

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

function isLikelyExamNumber(value: string) {
  return /^\d{4,}$/.test(value);
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function main() {
  loadLocalEnv();
  const mode = getMode();
  const indexes = getWorkbookIndexes();
  const selectedWorkbooks = indexes.map((index) => WORKBOOKS[index]);

  const prisma = getPrisma();
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  if (!admin) {
    throw new Error("No active admin user found.");
  }

  const workbookRoot = path.resolve(process.cwd(), "..", "참고자료");
  const buffers = await Promise.all(
    selectedWorkbooks.map(async (workbook) => ({
      ...workbook,
      filePath: path.join(workbookRoot, workbook.fileName),
      fileBuffer: await readFile(path.join(workbookRoot, workbook.fileName)),
    })),
  );

  const previews = await Promise.all(
    buffers.map(async (workbook) => ({
      ...workbook,
      preview: await previewLegacyWorkbookScores({
        fileName: workbook.fileName,
        fileBuffer: workbook.fileBuffer,
        periodId: PERIOD_ID,
        examType: workbook.examType,
      }),
    })),
  );

  const examNumberSet = new Set<string>();
  for (const item of previews) {
    for (const row of item.preview.rows) {
      if (row.examNumber && isLikelyExamNumber(row.examNumber)) {
        examNumberSet.add(row.examNumber);
      }
    }
  }

  const existingStudents = await prisma.student.findMany({
    where: {
      examNumber: {
        in: [...examNumberSet],
      },
    },
    select: {
      examNumber: true,
    },
  });
  const existingStudentSet = new Set(existingStudents.map((student) => student.examNumber));

  const candidates = new Map<string, Candidate>();

  for (const item of previews) {
    for (const row of item.preview.rows) {
      if (!row.examNumber || existingStudentSet.has(row.examNumber) || !isLikelyExamNumber(row.examNumber)) {
        continue;
      }

      const name = normalizeName(row.name);
      if (!name) {
        continue;
      }

      const current = candidates.get(row.examNumber);
      if (current) {
        if (!current.sources.includes(item.fileName)) {
          current.sources.push(item.fileName);
        }
        if (current.name.length < name.length) {
          current.name = name;
        }
        continue;
      }

      candidates.set(row.examNumber, {
        examNumber: row.examNumber,
        name,
        examType: item.examType,
        sources: [item.fileName],
      });
    }
  }

  const missingStudents = [...candidates.values()].sort((a, b) => a.examNumber.localeCompare(b.examNumber));

  if (mode !== "report" && missingStudents.length > 0) {
    await prisma.student.createMany({
      data: missingStudents.map((student) => ({
        examNumber: student.examNumber,
        name: student.name,
        examType: student.examType,
        studentType: StudentType.EXISTING,
        isActive: true,
        note: DEFAULT_NOTE,
      })),
      skipDuplicates: true,
    });
  }

  const rerunResults = [];
  if (mode === "full" || mode === "rerun") {
    for (const item of buffers) {
      const result = await executeLegacyWorkbookScores({
        adminId: admin.id,
        fileName: item.fileName,
        fileBuffer: item.fileBuffer,
        periodId: PERIOD_ID,
        examType: item.examType,
      });

      rerunResults.push({
        fileName: item.fileName,
        importedCount: result.importedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        invalidCount: result.invalidCount,
      });
    }
  }

  const postRerunPreviews = await Promise.all(
    buffers.map(async (workbook) => ({
      fileName: workbook.fileName,
      preview: await previewLegacyWorkbookScores({
        fileName: workbook.fileName,
        fileBuffer: workbook.fileBuffer,
        periodId: PERIOD_ID,
        examType: workbook.examType,
      }),
    })),
  );

  const allStudents = await prisma.student.findMany({
    where: {
      examNumber: {
        in: missingStudents.map((student) => student.examNumber),
      },
    },
    select: {
      examNumber: true,
      name: true,
      note: true,
      examType: true,
      studentType: true,
    },
    orderBy: {
      examNumber: "asc",
    },
  });

  const migrationScoreCount = await prisma.score.count({
    where: {
      sourceType: ScoreSource.MIGRATION,
      session: {
        periodId: PERIOD_ID,
      },
    },
  });

  const remainingMissingCounts = await Promise.all(
    postRerunPreviews.map(async (item) => {
      const examNumbers = [
        ...new Set(
          item.preview.rows
            .map((row) => row.examNumber)
            .filter((examNumber): examNumber is string => Boolean(examNumber && isLikelyExamNumber(examNumber))),
        ),
      ];

      const present = new Set(
        (
          await prisma.student.findMany({
            where: {
              examNumber: {
                in: examNumbers,
              },
            },
            select: {
              examNumber: true,
            },
          })
        ).map((student) => student.examNumber),
      );

      const remainingMissing = item.preview.rows.filter(
        (row) => row.examNumber && isLikelyExamNumber(row.examNumber) && !present.has(row.examNumber),
      );

      return {
        fileName: item.fileName,
        invalidCount: item.preview.summary.invalidRows,
        remainingMissingCount: new Set(remainingMissing.map((row) => row.examNumber)).size,
        remainingMissingExamples: [...new Set(remainingMissing.map((row) => `${row.examNumber} ${row.name}`))].slice(
          0,
          10,
        ),
      };
    }),
  );

  console.log(
    JSON.stringify(
      {
        admin,
        mode,
        workbookIndexes: indexes,
        createdStudents: {
          count: missingStudents.length,
          students: allStudents,
        },
        rerunResults: rerunResults.map((item) => ({
          fileName: item.fileName,
          importedCount: item.importedCount,
          createdCount: item.createdCount,
          updatedCount: item.updatedCount,
          invalidCount: item.invalidCount,
        })),
        remainingInvalids: remainingMissingCounts,
        migrationScoreCount,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
