import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type TenantType = "police" | "fire";

const origins: Record<TenantType, string> = {
  police: "https://fullservice.hankukpol.co.kr",
  fire: "https://fullservice.119sobang.co.kr",
};
const evidenceDir = resolve(
  process.cwd(),
  ".superloopy/evidence/deployment/20260807-score-predict-tenant-split"
);

class CookieJar {
  private values = new Map<string, string>();

  capture(response: Response) {
    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const cookies = getSetCookie ? getSetCookie.call(response.headers) : [];
    for (const cookie of cookies) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      if (separator > 0) this.values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return Array.from(this.values.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(url: string, init: RequestInit = {}, jar?: CookieJar) {
  const headers = new Headers(init.headers);
  const cookie = jar?.header();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(url, { ...init, headers, redirect: init.redirect ?? "manual" });
  jar?.capture(response);
  return response;
}

async function verifyTenant(tenantType: TenantType) {
  const origin = origins[tenantType];
  const opposite = tenantType === "police" ? "fire" : "police";
  const login = await request(`${origin}/login`);
  assert(login.status === 200, `${tenantType}: Production login page returned ${login.status}.`);
  const html = await login.text();
  assert(html.includes(tenantType === "police" ? "한국경찰학원 합격예측" : "소방 합격예측"), `${tenantType}: Production branding mismatch.`);

  const root = await request(`${origin}/`, { redirect: "follow" });
  assert(root.status === 200 && root.url.startsWith(origin), `${tenantType}: Production root did not remain on its official origin.`);
  const rootHtml = await root.text();
  assert(rootHtml.includes(tenantType === "police" ? "한국경찰학원 합격예측" : "소방 합격예측"), `${tenantType}: unauthenticated Production root branding mismatch.`);
  assert(
    !rootHtml.includes('id="username"') && !rootHtml.includes('id="phone"'),
    `${tenantType}: unauthenticated Production root rendered the login form instead of the public landing.`
  );

  const prefixed = await request(`${origin}/${tenantType}/login`);
  const canonicalLocation = prefixed.headers.get("location");
  assert(
    prefixed.status === 308 && (canonicalLocation === "/login" || canonicalLocation === `${origin}/login`),
    `${tenantType}: prefixed official URL did not canonicalize.`
  );

  const crossedPage = await request(`${origin}/${opposite}/login`);
  assert(crossedPage.status === 308 && crossedPage.headers.get("location") === `${origins[opposite]}/login`, `${tenantType}: cross-domain page redirect is incorrect.`);

  const crossedMutation = await request(`${origin}/${opposite}/api/submission`, { method: "POST" });
  assert(crossedMutation.status === 421, `${tenantType}: cross-domain mutation expected 421, received ${crossedMutation.status}.`);

  const unauthenticatedStats = await request(`${origin}/api/main-stats`);
  assert(unauthenticatedStats.status === 401, `${tenantType}: unauthenticated stats expected 401, received ${unauthenticatedStats.status}.`);

  const bridge = await request(`${origin}/api/auth/portal-bridge`, { method: "POST" });
  assert(bridge.status === 410, `${tenantType}: retired portal bridge expected 410, received ${bridge.status}.`);

  const jar = new CookieJar();
  const csrfResponse = await request(`${origin}/api/auth/csrf`, {}, jar);
  assert(csrfResponse.status === 200, `${tenantType}: Production CSRF route failed.`);
  const csrf = await csrfResponse.json() as { csrfToken?: string };
  assert(csrf.csrfToken, `${tenantType}: Production CSRF token is missing.`);
  const invalidBody = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    callbackUrl: `${origin}/`,
    password: "__intentionally_invalid_deployment_smoke_password__",
    json: "true",
  });
  invalidBody.set(tenantType === "police" ? "username" : "phone", tenantType === "police" ? "__deployment_smoke_nonexistent__" : "010-0000-9999");
  const invalidLogin = await request(`${origin}/api/auth/callback/credentials?json=true`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: invalidBody,
  }, jar);
  assert(invalidLogin.status === 200 || invalidLogin.status === 401, `${tenantType}: Production credential callback failed with ${invalidLogin.status}.`);
  const invalidPayload = await invalidLogin.json() as { url?: string };
  assert(invalidPayload.url?.includes("error=CredentialsSignin"), `${tenantType}: invalid Production credentials were not rejected.`);

  return {
    origin,
    loginPage: login.status,
    root: root.status,
    canonicalRedirect: prefixed.status,
    crossDomainRedirect: crossedPage.status,
    crossMutation: crossedMutation.status,
    unauthenticatedStats: unauthenticatedStats.status,
    portalBridge: bridge.status,
    csrf: csrfResponse.status,
    invalidCredentialsRejected: true,
  };
}

async function main() {
  assert(process.env.PRODUCTION_SMOKE_CONFIRM === "SMOKE_SCORE_PREDICT_OFFICIAL_DOMAINS", "Production smoke confirmation is missing.");
  const vercelRoot = await request("https://score-predict.vercel.app/");
  assert(vercelRoot.status === 404, `Vercel root expected 404, received ${vercelRoot.status}.`);
  const policeRedirect = await request("https://score-predict.vercel.app/police/login");
  const fireRedirect = await request("https://score-predict.vercel.app/fire/login");
  assert(policeRedirect.status === 308 && policeRedirect.headers.get("location") === `${origins.police}/login`, "Vercel police redirect is incorrect.");
  assert(fireRedirect.status === 308 && fireRedirect.headers.get("location") === `${origins.fire}/login`, "Vercel fire redirect is incorrect.");

  const report = {
    generatedAt: new Date().toISOString(),
    vercelRoot: vercelRoot.status,
    vercelRedirects: { police: policeRedirect.status, fire: fireRedirect.status },
    tenants: {
      police: await verifyTenant("police"),
      fire: await verifyTenant("fire"),
    },
  };
  mkdirSync(evidenceDir, { recursive: true });
  const reportPath = resolve(evidenceDir, "production-smoke.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ result: "passed", ...report, evidence: reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
