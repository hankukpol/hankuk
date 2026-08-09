import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const productionRef = "pbonwjwbtqyrfrxqdwlu";
const projectId = "prj_M7dR3Of2eUxUDCL3QGKcrBdDjQrC";
const teamId = "team_S1kpwEzE2Hbujvnuawv7OPz0";
const envPath = resolve(process.cwd(), ".env.production.audit.local");

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

function getVercelToken() {
  const authPath = process.platform === "win32"
    ? resolve(process.env.APPDATA ?? "", "com.vercel.cli/Data/auth.json")
    : resolve(process.env.XDG_DATA_HOME ?? resolve(homedir(), ".local/share"), "com.vercel.cli/auth.json");
  const parsed = JSON.parse(readFileSync(authPath, "utf8")) as { token?: string };
  assert(parsed.token, "Vercel CLI auth token is missing.");
  return parsed.token;
}

async function main() {
  assert(
    process.env.PRODUCTION_RUNTIME_CONFIRM === `CONFIGURE_SCORE_PREDICT_PRODUCTION_RUNTIME_${productionRef}`,
    `PRODUCTION_RUNTIME_CONFIRM must equal CONFIGURE_SCORE_PREDICT_PRODUCTION_RUNTIME_${productionRef}.`
  );
  const values = parseEnvFile();
  const directUrl = values.DIRECT_URL;
  assert(directUrl?.includes(productionRef), "Production DIRECT_URL does not point to the approved Supabase project.");
  assert(!directUrl.includes("ftzcmuvunhbwetzdwyfy"), "Staging Supabase URL cannot be used in Production.");
  const runtimeUrl = new URL(directUrl);
  assert(runtimeUrl.hostname.endsWith(".pooler.supabase.com"), "Production runtime must use the Supabase IPv4 pooler.");
  runtimeUrl.port = "5432";
  runtimeUrl.searchParams.set("schema", "score_predict_fire");
  runtimeUrl.searchParams.set("connection_limit", "1");
  runtimeUrl.searchParams.delete("pgbouncer");

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true&teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getVercelToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "encrypted",
        key: "DATABASE_URL",
        value: runtimeUrl.toString(),
        target: ["production"],
      }),
    }
  );
  assert(response.ok, `Failed to configure Production DATABASE_URL (${response.status}): ${await response.text()}`);
  console.log(JSON.stringify({
    configured: "DATABASE_URL",
    target: "production",
    host: runtimeUrl.hostname,
    port: runtimeUrl.port,
    schema: runtimeUrl.searchParams.get("schema"),
    connectionLimit: runtimeUrl.searchParams.get("connection_limit"),
    transactionPooler: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
