import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

type StagingCommand = "reset" | "test";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(appDir, ".env.staging.local");
const productionProjectRef = "pbonwjwbtqyrfrxqdwlu";
const schemas = ["score_predict_police", "score_predict_fire"] as const;

function readEnvFile() {
  const values: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) values[match[1]] = match[2].replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return values;
}

function runPnpm(args: string[], env: NodeJS.ProcessEnv) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, args, {
    cwd: appDir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed with ${result.status}.`);
}

function validate(values: Record<string, string>, providedConfirmation: string | undefined) {
  const ref = values.STAGING_PROJECT_REF;
  const expected = `RESET_SCORE_PREDICT_STAGING_${ref}`;
  if (values.STAGING_PROJECT_NAME !== "score-predict-staging") throw new Error("Unexpected staging project name.");
  if (!ref || ref === productionProjectRef) throw new Error("Unsafe staging project reference.");
  if (values.STAGING_RESET_EXPECTED !== expected || providedConfirmation !== expected) {
    throw new Error(`STAGING_RESET_CONFIRM must equal ${expected}.`);
  }
  const databaseUrl = values.DATABASE_URL;
  if (!databaseUrl) throw new Error("Staging DATABASE_URL is missing.");
  const parsed = new URL(databaseUrl);
  const belongsToProject = parsed.hostname === `db.${ref}.supabase.co` || databaseUrl.includes(`postgres.${ref}`);
  if (!belongsToProject || !["5432", "6543"].includes(parsed.port)) {
    throw new Error("Staging database URL does not match the confirmed project.");
  }
  return { ref, expected, databaseUrl };
}

function withSchema(rawUrl: string, schema: (typeof schemas)[number]) {
  const parsed = new URL(rawUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

async function dropSchemas(databaseUrl: string) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const schema of schemas) {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedStorage(values: Record<string, string>) {
  const headers = {
    apikey: values.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${values.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const existingBucket = await fetch(`${values.SUPABASE_URL}/storage/v1/bucket/uploads`, {
    headers,
  });
  if (existingBucket.status === 404) {
    const bucket = await fetch(`${values.SUPABASE_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "uploads", name: "uploads", public: true }),
    });
    if (!bucket.ok) {
      throw new Error(`Staging bucket creation failed: ${bucket.status}`);
    }
  } else if (!existingBucket.ok) {
    throw new Error(`Staging bucket lookup failed: ${existingBucket.status}`);
  }
  for (const tenantType of ["police", "fire"] as const) {
    const response = await fetch(`${values.SUPABASE_URL}/storage/v1/object/uploads/${tenantType}/tenant-proof.svg`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "image/svg+xml", "x-upsert": "true" },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><text x="20" y="68">${tenantType} staging proof</text></svg>`,
    });
    if (!response.ok) throw new Error(`Staging storage upload failed for ${tenantType}: ${response.status}`);
  }
}

async function reset(values: Record<string, string>) {
  const validated = validate(values, process.env.STAGING_RESET_CONFIRM);
  const commandEnv = { ...process.env, ...values };
  await dropSchemas(validated.databaseUrl);
  for (const schema of schemas) {
    const url = withSchema(validated.databaseUrl, schema);
    runPnpm(["exec", "prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
      ...commandEnv,
      DATABASE_URL: url,
      DIRECT_URL: url,
    });
  }
  runPnpm(["db:tenants:deploy"], {
    ...commandEnv,
    DATABASE_URL: validated.databaseUrl,
    DIRECT_URL: values.DIRECT_URL ?? validated.databaseUrl,
    TENANT_SCHEMA_MIGRATION_CONFIRM: `MIGRATE_SCORE_PREDICT_STAGING_${validated.ref}`,
  });
  runPnpm(["exec", "tsx", "prisma/seed-local.ts"], {
    ...commandEnv,
    DATABASE_URL: validated.databaseUrl,
    DIRECT_URL: validated.databaseUrl,
    STAGING_SEED_CONFIRM: validated.expected,
  });
  await seedStorage(values);
  console.log(`Staging reset completed for ${validated.ref}.`);
}

async function test(values: Record<string, string>) {
  const ref = values.STAGING_PROJECT_REF;
  const expected = `TEST_SCORE_PREDICT_STAGING_${ref}`;
  if (process.env.STAGING_TEST_CONFIRM !== expected) throw new Error(`STAGING_TEST_CONFIRM must equal ${expected}.`);
  validate(values, values.STAGING_RESET_EXPECTED);
  runPnpm(["exec", "tsx", "scripts/staging-isolation-test.ts"], {
    ...process.env,
    ...values,
    STAGING_TEST_CONFIRM: expected,
  });
}

async function main() {
  const values = readEnvFile();
  const command = process.argv[2] as StagingCommand | undefined;
  if (command === "reset") return reset(values);
  if (command === "test") return test(values);
  throw new Error("Usage: staging-environment.ts <reset|test>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
