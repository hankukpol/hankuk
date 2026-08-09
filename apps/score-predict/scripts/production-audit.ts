import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient, Role } from "@prisma/client";

type TenantType = "police" | "fire";

const productionRef = "pbonwjwbtqyrfrxqdwlu";
const schemas: Record<TenantType, string> = {
  police: "score_predict_police",
  fire: "score_predict_fire",
};
const appDir = resolve(process.cwd());
const envPath = resolve(appDir, ".env.production.audit.local");
const evidenceDir = resolve(
  appDir,
  ".superloopy/evidence/deployment/20260807-score-predict-tenant-split"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseEnvFile() {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\n", "\n").replaceAll("\\\\", "\\");
    }
    values[key] = value;
  }
  return values;
}

function databaseUrlForSchema(rawUrl: string, schema: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

function readBackupStatus() {
  const result = spawnSync("supabase", ["backups", "list", "--project-ref", productionRef, "-o", "json"], {
    cwd: appDir,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  assert(result.status === 0, `Supabase backup status check failed: ${result.stderr}`);
  const payload = JSON.parse(result.stdout) as {
    backups?: Array<{ inserted_at: string; is_physical_backup: boolean; status: string }>;
    pitr_enabled?: boolean;
    walg_enabled?: boolean;
    region?: string;
  };
  const latest = payload.backups?.[0];
  assert(latest?.status === "COMPLETED", "The latest production Supabase backup is not complete.");
  return {
    latestCompletedAt: latest.inserted_at,
    isPhysicalBackup: latest.is_physical_backup,
    pitrEnabled: Boolean(payload.pitr_enabled),
    walgEnabled: Boolean(payload.walg_enabled),
    region: payload.region,
  };
}

async function auditTenant(tenantType: TenantType, rawDatabaseUrl: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrlForSchema(rawDatabaseUrl, schemas[tenantType]) } },
    log: ["error"],
  });
  try {
    const [users, admins, exams, activeExams, submissions, subjects, quotas, notices, faqs, banners, score, rounds] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: Role.ADMIN } }),
      prisma.exam.count(),
      prisma.exam.count({ where: { isActive: true } }),
      prisma.submission.count(),
      prisma.subject.findMany({ select: { name: true, examType: true, maxScore: true }, orderBy: [{ examType: "asc" }, { id: "asc" }] }),
      prisma.examRegionQuota.count(),
      prisma.notice.count(),
      prisma.faq.count(),
      prisma.banner.count(),
      prisma.submission.aggregate({ _avg: { finalScore: true }, _max: { finalScore: true }, _min: { finalScore: true } }),
      prisma.exam.findMany({
        orderBy: [{ year: "asc" }, { round: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          year: true,
          round: true,
          examDate: true,
          isActive: true,
          _count: {
            select: {
              submissions: true,
              preRegistrations: true,
              answerKeys: true,
            },
          },
        },
      }),
    ]);
    const totalsByExamType = Object.fromEntries(
      Object.entries(Object.groupBy(subjects, (subject) => subject.examType)).map(([examType, rows]) => [
        examType,
        rows?.reduce((sum, subject) => sum + subject.maxScore, 0) ?? 0,
      ])
    );
    return {
      schema: schemas[tenantType],
      counts: { users, admins, exams, activeExams, submissions, subjects: subjects.length, quotas, notices, faqs, banners },
      subjectNamesByExamType: Object.fromEntries(
        Object.entries(Object.groupBy(subjects, (subject) => subject.examType)).map(([examType, rows]) => [
          examType,
          rows?.map((subject) => subject.name) ?? [],
        ])
      ),
      totalsByExamType,
      scoreSummary: {
        average: score._avg.finalScore,
        minimum: score._min.finalScore,
        maximum: score._max.finalScore,
      },
      rounds: rounds.map((round) => ({
        id: round.id,
        name: round.name,
        year: round.year,
        round: round.round,
        examDate: round.examDate.toISOString(),
        isActive: round.isActive,
        counts: round._count,
      })),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const phase = process.argv[2];
  assert(phase === "before" || phase === "after", "Use production:audit -- before or production:audit -- after.");
  assert(
    process.env.PRODUCTION_AUDIT_CONFIRM === `AUDIT_SCORE_PREDICT_PRODUCTION_${productionRef}`,
    `PRODUCTION_AUDIT_CONFIRM must equal AUDIT_SCORE_PREDICT_PRODUCTION_${productionRef}.`
  );
  const values = parseEnvFile();
  const databaseUrl = values.DATABASE_URL;
  assert(databaseUrl, "Production DATABASE_URL is missing from the pulled Vercel environment.");
  assert(databaseUrl.includes(productionRef), "Refusing to audit a database that is not the approved production Supabase project.");
  assert(!databaseUrl.includes("ftzcmuvunhbwetzdwyfy"), "Refusing to treat the staging database as production.");

  const report = {
    phase,
    generatedAt: new Date().toISOString(),
    projectRef: productionRef,
    backup: readBackupStatus(),
    tenants: {
      police: await auditTenant("police", databaseUrl),
      fire: await auditTenant("fire", databaseUrl),
    },
  };
  mkdirSync(evidenceDir, { recursive: true });
  const reportPath = resolve(evidenceDir, `production-${phase}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    phase,
    backup: report.backup,
    police: report.tenants.police.counts,
    fire: report.tenants.fire.counts,
    evidence: reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
