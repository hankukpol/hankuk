import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tenantSchemas = ["score_predict_police", "score_predict_fire"] as const;
const productionProjectRef = "pbonwjwbtqyrfrxqdwlu";
const localHosts = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);
type Command = "deploy" | "status";
type TenantSchema = (typeof tenantSchemas)[number];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function withSchema(rawUrl: string, schema: TenantSchema) {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function projectRefFromUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const directMatch = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (directMatch) return directMatch[1];
  const poolerMatch = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/i);
  return poolerMatch?.[1] ?? null;
}

function runPrisma(args: string[], databaseUrl: string, directUrl: string) {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const prismaArgs = ["exec", "prisma", ...args];
  const windowsCommand = [executable, ...prismaArgs]
    .map((part) => (/^[A-Za-z0-9_./:=\\-]+$/.test(part) ? part : `"${part.replaceAll('"', '""')}"`))
    .join(" ");
  const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : executable;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", windowsCommand] : prismaArgs;
  const result = spawnSync(command, commandArgs, {
    cwd: appDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function migrationNames() {
  return readdirSync(resolve(appDir, "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function preflightSchema(rawDirectUrl: string, schema: TenantSchema) {
  const directUrl = withSchema(rawDirectUrl, schema);
  const prisma = new PrismaClient({ datasources: { db: { url: directUrl } }, log: ["error"] });
  try {
    const tables = await prisma.$queryRaw<Array<{ exam: string | null; user_table: string | null }>>`
      SELECT to_regclass('"Exam"')::text AS exam, to_regclass('"User"')::text AS user_table
    `;
    assert(tables[0]?.exam && tables[0]?.user_table, `${schema}: core tables are missing.`);

    const activeRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Exam" WHERE "isActive" = TRUE
    `;
    const activeCount = Number(activeRows[0]?.count ?? 0);
    assert(activeCount <= 1, `${schema}: ${activeCount} active exams exist. Resolve duplicates before migration.`);

    const ledgerRows = await prisma.$queryRaw<Array<{ ledger: string | null }>>`
      SELECT to_regclass('"_prisma_migrations"')::text AS ledger
    `;
    let migrationCount = 0;
    let migrationLedgerRowCount = 0;
    if (ledgerRows[0]?.ledger) {
      const counts = await prisma.$queryRaw<Array<{ applied_count: bigint; total_count: bigint }>>`
        SELECT
          COUNT(*) FILTER (
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          )::bigint AS applied_count,
          COUNT(*)::bigint AS total_count
        FROM "_prisma_migrations"
      `;
      migrationCount = Number(counts[0]?.applied_count ?? 0);
      migrationLedgerRowCount = Number(counts[0]?.total_count ?? 0);
    }

    return { schema, activeCount, migrationCount, migrationLedgerRowCount };
  } finally {
    await prisma.$disconnect();
  }
}

function bootstrapPatchHistory(databaseUrl: string, directUrl: string) {
  for (const migrationName of migrationNames()) {
    const migrationFile = `prisma/migrations/${migrationName}/migration.sql`;
    runPrisma(
      ["db", "execute", "--file", migrationFile, "--schema", "prisma/schema.prisma"],
      databaseUrl,
      directUrl
    );
    runPrisma(
      ["migrate", "resolve", "--applied", migrationName],
      databaseUrl,
      directUrl
    );
  }
}

async function verifySchema(rawDirectUrl: string, schema: TenantSchema) {
  const directUrl = withSchema(rawDirectUrl, schema);
  const prisma = new PrismaClient({ datasources: { db: { url: directUrl } }, log: ["error"] });
  try {
    const requiredColumns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'User' AND column_name IN (
            'smsMarketingConsentAt',
            'smsMarketingConsentVersion',
            'smsMarketingConsentWithdrawnAt'
          ))
          OR (table_name = 'PreRegistration' AND column_name IN ('submissionId', 'convertedAt'))
          OR (table_name = 'Exam' AND column_name IN (
            'policeWrittenPassMultiple',
            'policePredictionModelVersion'
          ))
        )
    `;
    assert(requiredColumns.length === 7, `${schema}: required migration columns are incomplete.`);

    const objects = await prisma.$queryRaw<
      Array<{ calibration_table: string | null; active_index: string | null }>
    >`
      SELECT
        to_regclass('"PredictionCalibrationSnapshot"')::text AS calibration_table,
        to_regclass('"Exam_single_active_exam_key"')::text AS active_index
    `;
    assert(objects[0]?.calibration_table, `${schema}: calibration snapshot table is missing.`);
    assert(objects[0]?.active_index, `${schema}: single-active-exam index is missing.`);

    const appliedRows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    const applied = new Set(appliedRows.map((row) => row.migration_name));
    for (const migration of [
      "20260328_add_site_content_tenant_type",
      "20260808_add_exam_lifecycle_and_sms_consent",
      "20260808_add_police_prediction_calibration",
      "20260808_enforce_single_active_exam",
    ]) {
      assert(applied.has(migration), `${schema}: migration ledger is missing ${migration}.`);
    }

    return { schema, requiredColumns: requiredColumns.length, migrationCount: applied.size };
  } finally {
    await prisma.$disconnect();
  }
}

function requireDeployConfirmation(rawDirectUrl: string) {
  const url = new URL(rawDirectUrl);
  if (localHosts.has(url.hostname)) return { environment: "local", projectRef: null };

  const projectRef = projectRefFromUrl(rawDirectUrl);
  assert(projectRef, "Hosted database project ref could not be determined from DIRECT_URL.");
  const environment = projectRef === productionProjectRef ? "production" : "staging";
  const expected = `MIGRATE_SCORE_PREDICT_${environment.toUpperCase()}_${projectRef}`;
  assert(
    process.env.TENANT_SCHEMA_MIGRATION_CONFIRM === expected,
    `TENANT_SCHEMA_MIGRATION_CONFIRM must equal ${expected}.`
  );
  return { environment, projectRef };
}

async function main() {
  const command = process.argv[2] as Command | undefined;
  assert(command === "deploy" || command === "status", "Usage: migrate-tenant-schemas.ts <deploy|status>");

  const databaseBaseUrl = process.env.DATABASE_URL;
  const directBaseUrl = process.env.DIRECT_URL ?? databaseBaseUrl;
  assert(databaseBaseUrl && directBaseUrl, "DATABASE_URL and DIRECT_URL are required.");

  const target = command === "deploy" ? requireDeployConfirmation(directBaseUrl) : null;
  const preflight = [];
  for (const schema of tenantSchemas) {
    preflight.push(await preflightSchema(directBaseUrl, schema));
  }

  for (const [index, schema] of tenantSchemas.entries()) {
    const databaseUrl = withSchema(databaseBaseUrl, schema);
    const directUrl = withSchema(directBaseUrl, schema);
    const current = preflight[index];
    if (command === "deploy" && current.migrationLedgerRowCount === 0) {
      console.warn(`${schema}: bootstrapping the patch-only Prisma migration history.`);
      bootstrapPatchHistory(databaseUrl, directUrl);
    } else {
      runPrisma(["migrate", command], databaseUrl, directUrl);
    }
  }

  const verified = [];
  if (command === "deploy") {
    for (const schema of tenantSchemas) {
      runPrisma(
        ["migrate", "status"],
        withSchema(databaseBaseUrl, schema),
        withSchema(directBaseUrl, schema)
      );
      verified.push(await verifySchema(directBaseUrl, schema));
    }
  }

  console.log(JSON.stringify({ command, target, preflight, verified }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
