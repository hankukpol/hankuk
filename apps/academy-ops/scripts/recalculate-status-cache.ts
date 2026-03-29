import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType } from "@prisma/client";
import { recalculateStatusCache } from "../src/lib/analytics/service";
import { getPrisma } from "../src/lib/prisma";

function getArg(name: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
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

function parseExamType(value: string | null) {
  if (value === ExamType.GONGCHAE || value === ExamType.GYEONGCHAE) {
    return value;
  }
  return null;
}

async function main() {
  loadLocalEnv();

  const prisma = getPrisma();
  const periodIdFilter = getArg("periodId");
  const examTypeFilter = parseExamType(getArg("examType"));

  const targets = await prisma.examSession.findMany({
    where: {
      periodId: periodIdFilter ? Number(periodIdFilter) : undefined,
      examType: examTypeFilter ?? undefined,
    },
    select: {
      periodId: true,
      examType: true,
      period: {
        select: {
          name: true,
        },
      },
    },
    distinct: ["periodId", "examType"],
    orderBy: [{ periodId: "asc" }, { examType: "asc" }],
  });

  const results: Array<{
    periodId: number;
    periodName: string;
    examType: ExamType;
    updatedStudentCount: number;
  }> = [];

  for (const target of targets) {
    const aggregates = await recalculateStatusCache(target.periodId, target.examType);
    results.push({
      periodId: target.periodId,
      periodName: target.period.name,
      examType: target.examType,
      updatedStudentCount: aggregates.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        requested: {
          periodId: periodIdFilter ? Number(periodIdFilter) : null,
          examType: examTypeFilter,
        },
        processedCount: results.length,
        results,
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
