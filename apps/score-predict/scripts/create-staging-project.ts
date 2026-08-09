import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

interface SupabaseProject {
  id?: string;
  ref?: string;
  name?: string;
  organization_id?: string;
}

interface SupabaseApiKey {
  name?: string;
  api_key?: string;
  key?: string;
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(appDir, "../..");
const envPath = resolve(appDir, ".env.staging.local");
const projectName = "score-predict-staging";
const organizationId = process.env.SUPABASE_ORG_ID ?? "jpnnyouvjldleiakeusi";
const productionProjectRef = "pbonwjwbtqyrfrxqdwlu";

function pnpmJson(args: string[]) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${args.join(" ")}`);
  const start = result.stdout.indexOf("[");
  const objectStart = result.stdout.indexOf("{");
  const jsonStart = start >= 0 && (objectStart < 0 || start < objectStart) ? start : objectStart;
  if (jsonStart < 0) throw new Error("Supabase CLI did not return JSON.");
  return JSON.parse(result.stdout.slice(jsonStart)) as unknown;
}

function escapeEnv(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function projectRef(project: SupabaseProject) {
  return project.ref ?? project.id ?? "";
}

async function main() {
  if (process.env.CREATE_STAGING_CONFIRM !== "CREATE_SCORE_PREDICT_STAGING") {
    throw new Error("CREATE_STAGING_CONFIRM must equal CREATE_SCORE_PREDICT_STAGING.");
  }

  let projects = pnpmJson(["exec", "supabase", "projects", "list", "-o", "json"]) as SupabaseProject[];
  let project = projects.find((item) => item.name === projectName);
  const databasePassword = randomBytes(30).toString("base64url");

  if (project && existsSync(envPath)) {
    const ref = projectRef(project);
    const current = readFileSync(envPath, "utf8");
    const migrated = current
      .replace("STAGING_RESET_CONFIRM=", "STAGING_RESET_EXPECTED=")
      .replaceAll(`postgresql://postgres:`, `postgresql://postgres.${ref}:`)
      .replaceAll(`@db.${ref}.supabase.co:5432`, "@aws-0-ap-northeast-2.pooler.supabase.com:5432")
      .replaceAll("@aws-1-ap-northeast-2.pooler.supabase.com:5432", "@aws-0-ap-northeast-2.pooler.supabase.com:5432");
    if (migrated !== current) writeFileSync(envPath, migrated, "utf8");
    console.log(`Staging project already exists and local credentials are present: ${projectName} (${projectRef(project)})`);
    return;
  }
  if (project) {
    throw new Error("Staging project exists but its local password file is missing. Reset the database password in Supabase before continuing.");
  }

  pnpmJson([
      "exec",
      "supabase",
      "projects",
      "create",
      projectName,
      "--org-id",
      organizationId,
      "--region",
      "ap-northeast-2",
      "--db-password",
      databasePassword,
      "--yes",
      "-o",
      "json",
  ]);
  projects = pnpmJson(["exec", "supabase", "projects", "list", "-o", "json"]) as SupabaseProject[];
  project = projects.find((item) => item.name === projectName);

  if (!project) throw new Error("Staging project creation did not return a project.");
  const ref = projectRef(project);
  if (!ref || ref === productionProjectRef) throw new Error("Unsafe or missing staging project reference.");

  const keys = pnpmJson([
    "exec",
    "supabase",
    "projects",
    "api-keys",
    "--project-ref",
    ref,
    "-o",
    "json",
  ]) as SupabaseApiKey[];
  const anonKey = keys.find((item) => item.name === "anon" || item.name === "publishable")?.api_key
    ?? keys.find((item) => item.name === "anon" || item.name === "publishable")?.key;
  const serviceRoleKey = keys.find((item) => item.name === "service_role" || item.name === "secret")?.api_key
    ?? keys.find((item) => item.name === "service_role" || item.name === "secret")?.key;
  if (!anonKey || !serviceRoleKey) throw new Error("Could not resolve staging Supabase API keys.");

  const encodedPassword = encodeURIComponent(databasePassword);
  const directUrl = `postgresql://postgres.${ref}:${encodedPassword}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`;
  const apiUrl = `https://${ref}.supabase.co`;
  const confirmation = `RESET_SCORE_PREDICT_STAGING_${ref}`;
  const contents = [
    `STAGING_PROJECT_NAME=${escapeEnv(projectName)}`,
    `STAGING_PROJECT_REF=${escapeEnv(ref)}`,
    `STAGING_RESET_EXPECTED=${escapeEnv(confirmation)}`,
    `DATABASE_URL=${escapeEnv(directUrl)}`,
    `DIRECT_URL=${escapeEnv(directUrl)}`,
    `NEXT_PUBLIC_SUPABASE_URL=${escapeEnv(apiUrl)}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${escapeEnv(anonKey)}`,
    `SUPABASE_URL=${escapeEnv(apiUrl)}`,
    `SUPABASE_SERVICE_ROLE_KEY=${escapeEnv(serviceRoleKey)}`,
    `SUPABASE_STORAGE_BUCKET="uploads"`,
    `NEXTAUTH_SECRET=${escapeEnv(`preview-${randomBytes(32).toString("hex")}`)}`,
    "",
  ].join("\n");
  writeFileSync(envPath, contents, "utf8");
  console.log(`Staging project ready: ${projectName} (${ref})`);
  console.log(`Credentials saved to ignored file: ${envPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
