import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ExamType, type Prisma, type StudentType } from "@prisma/client";
import { getPrisma } from "../src/lib/prisma";
import { previewStudentMigration } from "../src/lib/migration/students";

function getArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : fallback;
}

function getOptionalArg(name: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const filePath = getArg(
    "file",
    path.resolve(
      process.cwd(),
      "..",
      "참고자료",
      "1월 아침모의고사 기본이론반_전체성적.xlsx",
    ),
  );
  const sheetName = getOptionalArg("sheet");
  const examType = getArg("examType", "GONGCHAE") as ExamType;
  const studentType = getArg("studentType", "NEW") as StudentType;
  const classNameFallback = getArg("className", "기본이론반");
  const apply = hasFlag("apply");

  const preview = await previewStudentMigration({
    fileName: path.basename(filePath),
    fileBuffer: await readFile(filePath),
    sheetName,
    defaults: {
      examType,
      studentType,
      classNameFallback,
    },
  });

  console.log("Student migration preview");
  console.log(
    JSON.stringify(
      {
        filePath,
        selectedSheet: preview.sheetName,
        summary: preview.summary,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry run complete. Add --apply to upsert into the database.");
    return;
  }

  const validRows = preview.previewRows.filter((row) => row.status !== "invalid");

  if (validRows.length === 0) {
    throw new Error("There are no rows eligible for import.");
  }

  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      const data = {
        examNumber: row.record.examNumber,
        name: row.record.name,
        phone: row.record.phone,
        generation: row.record.generation,
        className: row.record.className,
        examType: row.record.examType,
        studentType: row.record.studentType,
        onlineId: row.record.onlineId,
        registeredAt: row.record.registeredAt,
        note: row.record.note,
        isActive: true,
      } satisfies Prisma.StudentUncheckedCreateInput;

      await tx.student.upsert({
        where: {
          examNumber: row.record.examNumber,
        },
        create: data,
        update: data,
      });
    }
  });

  console.log(`Import complete: ${validRows.length} students upserted.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
