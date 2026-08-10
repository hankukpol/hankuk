import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

type LocalCommand = "dev" | "up" | "reset" | "test" | "down";
type SupabaseStatus = Record<string, string>;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(appDir, "../..");
const composeFile = resolve(appDir, "docker-compose.local.yml");
const dockerEnvFile = resolve(appDir, ".env.docker.local");
const allowedHosts = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);
const allowedPorts = new Set(["54332"]);
const tenantSchemas = ["score_predict_police", "score_predict_fire"] as const;

function executable(name: string) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; capture?: boolean } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.${detail}`);
  }
  return String(result.stdout ?? "");
}

function pnpm(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; capture?: boolean } = {}) {
  return run(executable("pnpm"), args, options);
}

function dockerCompose(args: string[]) {
  return run("docker", ["compose", "--env-file", dockerEnvFile, "-f", composeFile, ...args], { cwd: appDir });
}

function getSupabaseStatus(): SupabaseStatus {
  const output = pnpm(["exec", "supabase", "status", "-o", "env"], { cwd: rootDir, capture: true });
  const result: SupabaseStatus = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) result[match[1]] = match[2];
  }
  for (const required of ["DB_URL", "API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (!result[required]) throw new Error(`Supabase status is missing ${required}.`);
  }
  return result;
}

function assertSafeLocalDatabaseUrl(rawUrl: string) {
  if (/\.supabase\.(?:co|com)/i.test(rawUrl)) {
    throw new Error("Hosted Supabase URL detected. Local operation aborted.");
  }
  const parsed = new URL(rawUrl);
  if (!allowedHosts.has(parsed.hostname) || !allowedPorts.has(parsed.port)) {
    throw new Error(`Unsafe database target: ${parsed.hostname}:${parsed.port}`);
  }
  const schema = parsed.searchParams.get("schema");
  if (schema && !tenantSchemas.includes(schema as (typeof tenantSchemas)[number])) {
    throw new Error(`Unexpected schema target: ${schema}`);
  }
}

function withSchema(rawUrl: string, schema: (typeof tenantSchemas)[number]) {
  assertSafeLocalDatabaseUrl(rawUrl);
  const parsed = new URL(rawUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function forContainer(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.hostname = "host.docker.internal";
  return parsed.toString();
}

function escapeEnv(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function writeDockerEnvironment(status: SupabaseStatus) {
  assertSafeLocalDatabaseUrl(status.DB_URL);
  const baseContainerUrl = forContainer(status.DB_URL);
  const contents = [
    `DATABASE_URL=${escapeEnv(withSchema(baseContainerUrl, "score_predict_fire"))}`,
    `DIRECT_URL=${escapeEnv(withSchema(baseContainerUrl, "score_predict_fire"))}`,
    `NEXTAUTH_SECRET=${escapeEnv(`local-${randomBytes(32).toString("hex")}`)}`,
    `COOKIE_DOMAIN=""`,
    `NEXT_PUBLIC_SUPABASE_URL=${escapeEnv(status.API_URL)}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${escapeEnv(status.ANON_KEY)}`,
    `SUPABASE_URL=${escapeEnv(status.API_URL.replace("127.0.0.1", "host.docker.internal"))}`,
    `SUPABASE_SERVICE_ROLE_KEY=${escapeEnv(status.SERVICE_ROLE_KEY)}`,
    `SUPABASE_STORAGE_BUCKET="uploads"`,
    `PASSWORD_RESET_DEBUG_LINK="true"`,
    `ADMIN_PHONE="010-0000-0000"`,
    `ADMIN_PASSWORD="LocalOnlyAdmin!123"`,
    "",
  ].join("\n");
  writeFileSync(dockerEnvFile, contents, "utf8");
}

async function dropTenantSchemas(baseUrl: string) {
  assertSafeLocalDatabaseUrl(baseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    for (const schema of tenantSchemas) {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedStorage(status: SupabaseStatus) {
  const headers = {
    apikey: status.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  };
  const bucketResponse = await fetch(`${status.API_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "uploads", name: "uploads", public: true }),
  });
  if (!bucketResponse.ok) {
    const responseText = await bucketResponse.text();
    const alreadyExists =
      bucketResponse.status === 409 ||
      (bucketResponse.status === 400 && /duplicate|already exists/i.test(responseText));
    if (!alreadyExists) {
      throw new Error(`Storage bucket creation failed: ${bucketResponse.status} ${responseText}`);
    }
  }

  for (const tenantType of ["police", "fire"] as const) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" fill="#f8fafc"/><text x="20" y="68" font-family="sans-serif" font-size="26" fill="#b91c1c">${tenantType} local proof</text></svg>`;
    const response = await fetch(
      `${status.API_URL}/storage/v1/object/uploads/${tenantType}/tenant-proof.svg`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "image/svg+xml", "x-upsert": "true" },
        body: svg,
      }
    );
    if (!response.ok) {
      throw new Error(`Storage upload failed for ${tenantType}: ${response.status} ${await response.text()}`);
    }
  }
}

async function ensureSupabase() {
  pnpm(["exec", "supabase", "start"], { cwd: rootDir });
  const status = getSupabaseStatus();
  writeDockerEnvironment(status);
  return status;
}

async function reset() {
  const status = await ensureSupabase();
  assertSafeLocalDatabaseUrl(status.DB_URL);
  await dropTenantSchemas(status.DB_URL);

  for (const schema of tenantSchemas) {
    const schemaUrl = withSchema(status.DB_URL, schema);
    pnpm(["exec", "prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
      cwd: appDir,
      env: { ...process.env, DATABASE_URL: schemaUrl, DIRECT_URL: schemaUrl },
    });
  }
  pnpm(["db:tenants:deploy"], {
    cwd: appDir,
    env: { ...process.env, DATABASE_URL: status.DB_URL, DIRECT_URL: status.DB_URL },
  });
  pnpm(["exec", "tsx", "prisma/seed-local.ts"], {
    cwd: appDir,
    env: {
      ...process.env,
      DATABASE_URL: status.DB_URL,
      DIRECT_URL: status.DB_URL,
      LOCAL_SEED_CONFIRM: "SCORE_PREDICT_LOCAL_ONLY",
    },
  });
  await seedStorage(status);
  console.log("Local police/fire schemas and storage were reset with fixed synthetic data.");
}

async function up() {
  await ensureSupabase();
  dockerCompose(["up", "--build", "-d"]);
  console.log("Police: http://police.localhost:3200");
  console.log("Fire:   http://fire.localhost:3200");
  console.log("Path mode: http://localhost:3200/police and /fire");
}

function createLocalDevelopmentEnvironment(status: SupabaseStatus): NodeJS.ProcessEnv {
  assertSafeLocalDatabaseUrl(status.DB_URL);

  return {
    ...process.env,
    DATABASE_URL: status.DB_URL,
    DIRECT_URL: status.DB_URL,
    NEXTAUTH_URL: "http://localhost:3200",
    NEXTAUTH_SECRET: "local-dev-nextauth-secret-at-least-32-characters",
    COOKIE_DOMAIN: "",
    NEXT_PUBLIC_TENANT_TYPE: "",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: "uploads",
    SCORE_PREDICT_POLICE_ORIGIN: "http://police.localhost:3200",
    SCORE_PREDICT_FIRE_ORIGIN: "http://fire.localhost:3200",
    PASSWORD_RESET_DEBUG_LINK: "true",
    RESEND_API_KEY: "",
    PASSWORD_RESET_MAIL_WEBHOOK_URL: "",
    PASSWORD_RESET_MAIL_WEBHOOK_TOKEN: "",
  };
}

async function dev() {
  const status = await ensureSupabase();

  // Docker 이미지는 소스를 복사하므로 핫 리로드가 되지 않는다. DB는 유지하고 웹 컨테이너만 멈춘다.
  dockerCompose(["stop", "web"]);

  console.log("Fast local development mode (Turbopack + hot reload)");
  console.log("Police: http://police.localhost:3200");
  console.log("Fire:   http://fire.localhost:3200");
  console.log("Path mode: http://localhost:3200/police and /fire");
  console.log("Local Supabase data is preserved. Press Ctrl+C to stop the Next.js server.");

  pnpm(["dev:fast"], {
    cwd: appDir,
    env: createLocalDevelopmentEnvironment(status),
  });
}

async function test() {
  const status = getSupabaseStatus();
  assertSafeLocalDatabaseUrl(status.DB_URL);
  // API·브라우저 검증이 오래된 컨테이너 소스를 보지 않도록 항상 현재 작업트리를 빌드한다.
  dockerCompose(["up", "--build", "-d"]);
  const testEnv = {
    ...process.env,
    DATABASE_URL: status.DB_URL,
    DIRECT_URL: status.DB_URL,
    NEXTAUTH_URL: "http://localhost:3200",
    NEXTAUTH_SECRET: "local-test-nextauth-secret-at-least-32-characters",
    COOKIE_DOMAIN: "",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: "uploads",
    SCORE_PREDICT_POLICE_ORIGIN: "http://police.localhost:3200",
    SCORE_PREDICT_FIRE_ORIGIN: "http://fire.localhost:3200",
    LOCAL_TEST_CONFIRM: "SCORE_PREDICT_LOCAL_ONLY",
  };
  pnpm(["typecheck"], { cwd: appDir, env: testEnv });
  pnpm(["lint"], { cwd: appDir, env: testEnv });
  pnpm(["build"], { cwd: appDir, env: testEnv });
  pnpm(["verify:calculations"], { cwd: appDir, env: testEnv });
  pnpm(["test:mailer-safety"], { cwd: appDir, env: testEnv });
  pnpm(["exec", "tsx", "scripts/local-isolation-test.ts"], { cwd: appDir, env: testEnv });
  pnpm(["test:account-recovery"], { cwd: appDir, env: testEnv });
  pnpm(["local:visual"], { cwd: appDir, env: testEnv });
}

async function down() {
  if (existsSync(dockerEnvFile)) dockerCompose(["down"]);
  pnpm(["exec", "supabase", "stop"], { cwd: rootDir });
}

async function main() {
  const command = process.argv[2] as LocalCommand | undefined;
  if (command === "dev") return dev();
  if (command === "up") return up();
  if (command === "reset") return reset();
  if (command === "test") return test();
  if (command === "down") return down();
  throw new Error("Usage: local-environment.ts <dev|up|reset|test|down>");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
