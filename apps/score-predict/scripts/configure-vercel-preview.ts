import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(appDir, ".env.staging.local");

function readEnvFile() {
  const values: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) values[match[1]] = match[2].replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return values;
}

function withRuntimeOptions(rawUrl: string) {
  const url = new URL(rawUrl);
  // Raw SQL in the application intentionally uses the tenant connection's
  // search_path. Supavisor transaction mode cannot retain that session state,
  // so Preview uses the IPv4-compatible session pooler with one connection per
  // Prisma client.
  url.port = "5432";
  url.searchParams.delete("pgbouncer");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("schema", "score_predict_fire");
  return url.toString();
}

function withDirectSchema(rawUrl: string) {
  const url = new URL(rawUrl);
  url.port = "5432";
  url.searchParams.set("schema", "score_predict_fire");
  return url.toString();
}

function getVercelToken() {
  const authPath = process.platform === "win32"
    ? resolve(process.env.APPDATA ?? "", "com.vercel.cli/Data/auth.json")
    : resolve(process.env.XDG_DATA_HOME ?? resolve(homedir(), ".local/share"), "com.vercel.cli/auth.json");
  const parsed = JSON.parse(readFileSync(authPath, "utf8")) as { token?: string };
  if (!parsed.token) throw new Error("Vercel CLI auth token is missing.");
  return parsed.token;
}

async function addPreviewVariable(token: string, name: string, value: string) {
  const projectId = "prj_M7dR3Of2eUxUDCL3QGKcrBdDjQrC";
  const teamId = "team_S1kpwEzE2Hbujvnuawv7OPz0";
  const response = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true&teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "encrypted", key: name, value, target: ["preview"] }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to set Vercel preview variable ${name}: ${response.status} ${await response.text()}`);
  }
  console.log(`Configured Preview variable: ${name}`);
}

async function main() {
  if (process.env.VERCEL_PREVIEW_CONFIG_CONFIRM !== "CONFIGURE_SCORE_PREDICT_PREVIEW") {
    throw new Error("VERCEL_PREVIEW_CONFIG_CONFIRM must equal CONFIGURE_SCORE_PREDICT_PREVIEW.");
  }
  const values = readEnvFile();
  const ref = values.STAGING_PROJECT_REF;
  if (!ref || ref === "pbonwjwbtqyrfrxqdwlu" || !values.DATABASE_URL.includes(ref)) {
    throw new Error("Preview database does not point to the approved staging project.");
  }

  const previewValues: Record<string, string> = {
    DATABASE_URL: withRuntimeOptions(values.DATABASE_URL),
    DIRECT_URL: withDirectSchema(values.DIRECT_URL),
    NEXTAUTH_SECRET: values.NEXTAUTH_SECRET,
    COOKIE_DOMAIN: "",
    NEXT_PUBLIC_TENANT_TYPE: "fire",
    NEXT_PUBLIC_SUPABASE_URL: values.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_URL: values.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: "uploads",
    SCORE_PREDICT_POLICE_ORIGIN: "https://fullservice.hankukpol.co.kr",
    SCORE_PREDICT_FIRE_ORIGIN: "https://fullservice.119sobang.co.kr",
    CRON_SECRET: values.NEXTAUTH_SECRET,
  };
  const token = getVercelToken();
  for (const [name, value] of Object.entries(previewValues)) {
    if (!value && name !== "COOKIE_DOMAIN") throw new Error(`Missing staging value for ${name}.`);
    await addPreviewVariable(token, name, value);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
