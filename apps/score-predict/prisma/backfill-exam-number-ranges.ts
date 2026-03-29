import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RANGE_FIELD_PAIRS = [
  ["examNumberStartPublicMale", "examNumberEndPublicMale"],
  ["examNumberStartPublicFemale", "examNumberEndPublicFemale"],
  ["examNumberStartCareerRescue", "examNumberEndCareerRescue"],
  ["examNumberStartCareerAcademicMale", "examNumberEndCareerAcademicMale"],
  ["examNumberStartCareerAcademicFemale", "examNumberEndCareerAcademicFemale"],
  ["examNumberStartCareerAcademicCombined", "examNumberEndCareerAcademicCombined"],
  ["examNumberStartCareerEmtMale", "examNumberEndCareerEmtMale"],
  ["examNumberStartCareerEmtFemale", "examNumberEndCareerEmtFemale"],
] as const;

async function main() {
  const rows = await prisma.examRegionQuota.findMany({
    select: {
      id: true,
      examNumberStart: true,
      examNumberEnd: true,
      examNumberStartPublicMale: true,
      examNumberEndPublicMale: true,
      examNumberStartPublicFemale: true,
      examNumberEndPublicFemale: true,
      examNumberStartCareerRescue: true,
      examNumberEndCareerRescue: true,
      examNumberStartCareerAcademicMale: true,
      examNumberEndCareerAcademicMale: true,
      examNumberStartCareerAcademicFemale: true,
      examNumberEndCareerAcademicFemale: true,
      examNumberStartCareerAcademicCombined: true,
      examNumberEndCareerAcademicCombined: true,
      examNumberStartCareerEmtMale: true,
      examNumberEndCareerEmtMale: true,
      examNumberStartCareerEmtFemale: true,
      examNumberEndCareerEmtFemale: true,
    },
  });

  let updatedCount = 0;
  for (const row of rows) {
    const legacyStart = row.examNumberStart?.trim() || null;
    const legacyEnd = row.examNumberEnd?.trim() || null;
    if (!legacyStart || !legacyEnd) {
      continue;
    }

    const updates: Record<string, string> = {};
    for (const [startField, endField] of RANGE_FIELD_PAIRS) {
      const currentStart = row[startField];
      const currentEnd = row[endField];
      if (!currentStart) {
        updates[startField] = legacyStart;
      }
      if (!currentEnd) {
        updates[endField] = legacyEnd;
      }
    }

    if (Object.keys(updates).length < 1) {
      continue;
    }

    await prisma.examRegionQuota.update({
      where: { id: row.id },
      data: updates,
    });
    updatedCount += 1;
  }

  console.log(`[backfill-exam-number-ranges] scanned=${rows.length} updated=${updatedCount}`);
}

main()
  .catch((error) => {
    console.error("[backfill-exam-number-ranges] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

