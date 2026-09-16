import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isMockMode } from "@/lib/mock-data";
import type { Prisma } from "@prisma/client";
import { conflict, notFound } from "@/lib/errors";
import { isExamPreviewEnabled } from "./gate";
import { emptyLearningDocument, type LearningDocument } from "./learning-types";

// Local preview persistence is deliberately separate from imported scores and operating data.
function location(divisionId: string) {
  if (!isExamPreviewEnabled() || !process.env.MOCK_DB_DIR)
    throw notFound("분리된 로컬 미리보기에서만 사용할 수 있습니다.");
  return path.join(
    path.resolve(process.env.MOCK_DB_DIR),
    "learning",
    createHash("sha256").update(divisionId).digest("hex") + ".json",
  );
}
export { loadAnalysisSource as learningSource } from "./source";
export async function readLearningDocument(
  divisionId: string,
): Promise<LearningDocument> {
  if (!isMockMode()) {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.examLearningDocument.findUnique({
      where: { divisionId },
    });
    const doc = row
      ? (row.document as unknown as LearningDocument)
      : emptyLearningDocument(divisionId);
    if (doc.divisionId !== divisionId)
      throw conflict("학습 저장소의 학원 정보가 일치하지 않습니다.");
    return doc;
  }
  try {
    const doc = JSON.parse(
      await readFile(location(divisionId), "utf8"),
    ) as LearningDocument;
    if (doc.divisionId !== divisionId)
      throw conflict("학습 저장소의 학원 정보가 일치하지 않습니다.");
    return doc;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyLearningDocument(divisionId);
    throw error;
  }
}
export async function updateLearningDocument(
  divisionId: string,
  update: (doc: LearningDocument) => LearningDocument,
) {
  if (!isMockMode()) {
    const { prisma } = await import("@/lib/prisma");
    return prisma.$transaction(
      async (tx) => {
        // The row lock serializes updates across independent serverless instances.
        await tx.examLearningDocument.createMany({
          skipDuplicates: true,
          data: {
            divisionId,
            document: emptyLearningDocument(
              divisionId,
            ) as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.$queryRaw`SELECT division_id FROM exam_learning_documents WHERE division_id = ${divisionId} FOR UPDATE`;
        const row = await tx.examLearningDocument.findUniqueOrThrow({
          where: { divisionId },
        });
        const current = row.document as unknown as LearningDocument;
        if (current.divisionId !== divisionId)
          throw conflict("학습 저장소의 학원 정보가 일치하지 않습니다.");
        const result = update(current);
        await tx.examLearningDocument.update({
          where: { divisionId },
          data: { document: result as unknown as Prisma.InputJsonValue },
        });
        return result;
      },
      { maxWait: 10000, timeout: 10000 },
    );
  }
  const file = location(divisionId);
  await mkdir(path.dirname(file), { recursive: true });
  let lock;
  try {
    lock = await open(file + ".lock", "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw conflict("다른 저장이 진행 중입니다. 잠시 후 다시 시도해주세요.");
    throw error;
  }
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const result = update(await readLearningDocument(divisionId));
    await writeFile(temp, JSON.stringify(result, null, 2), "utf8");
    await rename(temp, file);
    return result;
  } finally {
    await lock.close();
    await unlink(file + ".lock");
    await unlink(temp).catch(() => undefined);
  }
}
