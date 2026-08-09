import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type TenantType = "police" | "fire";

type ResponseResult = {
  body: string;
  status: number;
};

const deployment = process.env.VERCEL_PREVIEW_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
const appDir = resolve(process.cwd());

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function request(pathname: string, jar: string, curlArgs: string[] = []): ResponseResult {
  assert(deployment, "VERCEL_PREVIEW_URL is required.");
  const cliArgs = [
    "curl",
    pathname,
    "--cwd",
    appDir,
    "--deployment",
    deployment,
    "--",
    "--silent",
    "--show-error",
    "--cookie-jar",
    jar,
    "--cookie",
    jar,
    ...curlArgs,
    "--write-out",
    "\\n%{http_code}",
  ];
  const windowsCli = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules", "vercel", "dist", "vc.js")
    : "";
  const executable = process.platform === "win32" ? process.execPath : "vercel";
  const args = process.platform === "win32" ? [windowsCli, ...cliArgs] : cliArgs;
  assert(process.platform !== "win32" || existsSync(windowsCli), "The Vercel CLI installation could not be located.");
  const result = spawnSync(executable, args, {
    cwd: appDir,
    encoding: "utf8",
    env: process.env,
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `Vercel request failed for ${pathname}: ${result.stderr || result.stdout}`);
  const output = result.stdout.trimEnd();
  const splitAt = output.lastIndexOf("\n");
  assert(splitAt >= 0, `Missing status code for ${pathname}.`);
  const status = Number(output.slice(splitAt + 1));
  assert(Number.isInteger(status), `Invalid status code for ${pathname}.`);
  return { body: output.slice(0, splitAt), status };
}

function json<T>(response: ResponseResult, context: string): T {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new Error(`${context} did not return JSON (status ${response.status}).`);
  }
}

function tenantPath(tenantType: TenantType, pathname: string) {
  return `/${tenantType}${pathname}`;
}

function verifyStats(tenantType: TenantType, payload: {
  tenantType?: string;
  examTypes?: Array<{ key: string }>;
  scoreDistributions?: Record<string, Array<{ label: string; maxScore: number }>>;
}) {
  assert(payload.tenantType === tenantType, `${tenantType}: main stats tenant mismatch.`);
  const examTypes = new Set(payload.examTypes?.map((item) => item.key) ?? []);
  const distribution = payload.scoreDistributions?.PUBLIC ?? [];
  const labels = new Set(distribution.map((item) => item.label));
  if (tenantType === "police") {
    assert(examTypes.has("PUBLIC") && examTypes.has("CAREER"), "Police exam types are incomplete.");
    assert(!examTypes.has("CAREER_RESCUE") && !examTypes.has("CAREER_EMT"), "Fire exam types leaked into police Preview stats.");
    assert(labels.has("헌법") && labels.has("형사법") && labels.has("경찰학"), "Police subjects are incomplete in Preview.");
    assert(!labels.has("소방학개론"), "Fire subject leaked into police Preview stats.");
    assert(distribution.find((item) => item.label === "총점")?.maxScore === 250, "Police Preview total max score must be 250.");
  } else {
    assert(examTypes.has("CAREER_RESCUE") && examTypes.has("CAREER_EMT"), "Fire exam types are incomplete.");
    assert(!examTypes.has("CAREER"), "Police career type leaked into fire Preview stats.");
    assert(labels.has("소방학개론") && labels.has("소방관계법규") && labels.has("행정법총론"), "Fire subjects are incomplete in Preview.");
    assert(!labels.has("헌법"), "Police subject leaked into fire Preview stats.");
    assert(distribution.find((item) => item.label === "총점")?.maxScore === 300, "Fire Preview total max score must be 300.");
  }
}

function login(tenantType: TenantType, password: string, identifier: string, jar: string, adminOnly = false) {
  const csrfResponse = request(tenantPath(tenantType, "/api/auth/csrf"), jar);
  assert(csrfResponse.status === 200, `${tenantType}: Preview CSRF failed with ${csrfResponse.status}.`);
  const csrf = json<{ csrfToken?: string }>(csrfResponse, `${tenantType} CSRF`);
  assert(csrf.csrfToken, `${tenantType}: Preview CSRF token is missing.`);

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    callbackUrl: `https://${deployment}/${tenantType}/exam/main`,
    password,
    json: "true",
  });
  body.set(tenantType === "police" ? "username" : "phone", identifier);
  if (adminOnly) body.set("adminOnly", "true");

  const response = request(tenantPath(tenantType, "/api/auth/callback/credentials?json=true"), jar, [
    "--request",
    "POST",
    "--header",
    "Content-Type: application/x-www-form-urlencoded",
    "--data",
    body.toString(),
  ]);
  return { response, payload: json<{ url?: string }>(response, `${tenantType} login`) };
}

async function main() {
  assert(deployment, "VERCEL_PREVIEW_URL is required.");
  assert(!deployment.includes("score-predict.vercel.app"), "Refusing to run Preview tests against the production alias.");
  const tempDir = await mkdtemp(join(tmpdir(), "score-predict-preview-"));
  try {
    for (const tenantType of ["police", "fire"] as const) {
      const loginPage = request(tenantPath(tenantType, "/login"), join(tempDir, `${tenantType}-page.cookies`));
      assert(loginPage.status === 200, `${tenantType}: Preview login page returned ${loginPage.status}.`);
      assert(loginPage.body.includes(tenantType === "police" ? "한국경찰학원 합격예측" : "소방 합격예측"), `${tenantType}: Preview login branding mismatch.`);

      const userJar = join(tempDir, `${tenantType}-user.cookies`);
      const ownPassword = tenantType === "police" ? "PoliceLocal!123" : "FireLocal!123";
      const own = login(tenantType, ownPassword, "010-9000-0000", userJar);
      assert(own.response.status === 200 && !own.payload.url?.includes("error="), `${tenantType}: Preview user login failed.`);

      const sessionResponse = request(tenantPath(tenantType, "/api/auth/session"), userJar);
      assert(sessionResponse.status === 200, `${tenantType}: Preview session lookup failed.`);
      const session = json<{ user?: { tenantType?: string; sessionVersion?: number } }>(sessionResponse, `${tenantType} session`);
      assert(session.user?.tenantType === tenantType, `${tenantType}: Preview session tenant claim mismatch.`);
      assert(session.user?.sessionVersion === 2, `${tenantType}: Preview session version mismatch.`);

      const statsResponse = request(tenantPath(tenantType, "/api/main-stats"), userJar);
      assert(statsResponse.status === 200, `${tenantType}: Preview main stats failed.`);
      verifyStats(tenantType, json(statsResponse, `${tenantType} main stats`));

      const opposite = tenantType === "police" ? "fire" : "police";
      const crossedSession = request(tenantPath(opposite, "/api/auth/session"), userJar);
      assert(crossedSession.status === 401, `${tenantType}: crossed Preview session expected 401, received ${crossedSession.status}.`);

      const wrongJar = join(tempDir, `${tenantType}-wrong.cookies`);
      const wrongPassword = tenantType === "police" ? "FireLocal!123" : "PoliceLocal!123";
      const wrong = login(tenantType, wrongPassword, "010-9000-0000", wrongJar);
      assert(wrong.payload.url?.includes("error=CredentialsSignin"), `${tenantType}: opposite tenant password logged in on Preview.`);

      const adminJar = join(tempDir, `${tenantType}-admin.cookies`);
      const adminPassword = tenantType === "police" ? "PoliceAdmin!123" : "FireAdmin!123";
      const admin = login(tenantType, adminPassword, "010-0000-0000", adminJar, true);
      assert(admin.response.status === 200 && !admin.payload.url?.includes("error="), `${tenantType}: Preview admin login failed.`);
      const ownAdmin = request(tenantPath(tenantType, "/api/admin/users"), adminJar);
      assert(ownAdmin.status === 200, `${tenantType}: own Preview admin API failed with ${ownAdmin.status}.`);
      const crossedAdmin = request(tenantPath(opposite, "/api/admin/users"), adminJar);
      assert(crossedAdmin.status === 401, `${tenantType}: crossed Preview admin API expected 401, received ${crossedAdmin.status}.`);
    }

    console.log(JSON.stringify({ deployment: `https://${deployment}`, previewIsolation: "passed" }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
