import bcrypt from "bcryptjs";
import { ExamType, PrismaClient } from "@prisma/client";

type TenantType = "police" | "fire";

const schemas: Record<TenantType, string> = {
  police: "score_predict_police",
  fire: "score_predict_fire",
};
const passwords: Record<TenantType, string> = {
  police: "PoliceLocal!123",
  fire: "FireLocal!123",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clientFor(databaseUrl: string, tenantType: TenantType) {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schemas[tenantType]);
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

async function main() {
  const ref = process.env.STAGING_PROJECT_REF ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  assert(ref && ref !== "pbonwjwbtqyrfrxqdwlu", "Unsafe staging project reference.");
  assert(process.env.STAGING_TEST_CONFIRM === `TEST_SCORE_PREDICT_STAGING_${ref}`, "Staging test confirmation mismatch.");
  assert(databaseUrl.includes(ref), "Staging database URL does not match project reference.");

  const clients = {
    police: clientFor(databaseUrl, "police"),
    fire: clientFor(databaseUrl, "fire"),
  };
  const reports = [];
  try {
    for (const tenantType of ["police", "fire"] as const) {
      const prisma = clients[tenantType];
      const [users, admins, submissions, suspicious, failedScores, subjects, sharedUser] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.submission.count(),
        prisma.submission.count({ where: { isSuspicious: true } }),
        prisma.subjectScore.count({ where: { isFailed: true } }),
        prisma.subject.findMany(),
        prisma.user.findUnique({ where: { phone: "010-9000-0000" } }),
      ]);
      const expectedUsers = tenantType === "police" ? 18 : 17;
      const expectedAdmins = tenantType === "police" ? 2 : 1;
      assert(
        users === expectedUsers && admins === expectedAdmins,
        `${tenantType}: account seed mismatch (users=${users}, admins=${admins}).`
      );
      assert(submissions === 16 && suspicious === 1 && failedScores >= 1, `${tenantType}: submission seed mismatch.`);
      assert(sharedUser?.id === 2, `${tenantType}: fixed shared user ID mismatch.`);
      assert(await bcrypt.compare(passwords[tenantType], sharedUser.password), `${tenantType}: own password mismatch.`);
      const opposite = tenantType === "police" ? "fire" : "police";
      assert(!(await bcrypt.compare(passwords[opposite], sharedUser.password)), `${tenantType}: opposite password crossed schemas.`);
      const names = new Set(subjects.map((subject) => subject.name));
      if (tenantType === "police") {
        assert(names.has("헌법") && names.has("형사법") && !names.has("소방학개론"), "Police subject isolation failed.");
      } else {
        assert(names.has("소방학개론") && names.has("소방관계법규") && !names.has("헌법"), "Fire subject isolation failed.");
      }
      const totalMax = subjects.filter((subject) => subject.examType === ExamType.PUBLIC).reduce((sum, subject) => sum + subject.maxScore, 0);
      assert(totalMax === (tenantType === "police" ? 250 : 300), `${tenantType}: total max score mismatch.`);
      reports.push({ tenantType, users, submissions, subjects: subjects.length, totalMax });
    }
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()));
  }

  for (const tenantType of ["police", "fire"] as const) {
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/uploads/${tenantType}/tenant-proof.svg`);
    assert(response.ok, `${tenantType}: staging storage object missing.`);
  }
  console.log(JSON.stringify({ stagingIsolation: "passed", projectRef: ref, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
