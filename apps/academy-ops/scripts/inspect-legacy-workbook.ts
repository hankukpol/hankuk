import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExamType, StudentType } from "@prisma/client";
import { previewStudentMigration } from "../src/lib/migration/students";

function getArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : fallback;
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
  const examType = getArg("examType", "GONGCHAE") as ExamType;
  const studentType = getArg("studentType", "NEW") as StudentType;
  const classNameFallback = getArg("className", "기본이론반");

  const preview = await previewStudentMigration({
    fileName: path.basename(filePath),
    fileBuffer: await readFile(filePath),
    defaults: {
      examType,
      studentType,
      classNameFallback,
    },
  });

  console.log(
    JSON.stringify(
      {
        filePath,
        sheetNames: preview.sheetNames,
        selectedSheet: preview.sheetName,
        headerRowIndex: preview.headerRowIndex,
        inferredMapping: preview.mapping,
        summary: preview.summary,
        columns: preview.columns.slice(0, 8),
        previewRows: preview.previewRows.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
