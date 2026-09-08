import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

const baseUrl = process.env.TEST_BASE_URL;
if (!baseUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl) || process.env.MOCK_MODE !== "true") {
  throw new Error("Run pnpm test:integration; HTTP tests require an isolated local mock runtime.");
}

function routes(directory = "app/api"): Array<{ url: string; method: string; source: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return routes(file);
    if (entry.name !== "route.ts") return [];
    const source = readFileSync(file, "utf8");
    const methods = Array.from(source.matchAll(/export\s+(?:(?:async\s+)?function\s+|const\s+|\{\s*)(GET|POST|PUT|PATCH|DELETE)\b/g)).map((match) => match[1]);
    const url = "/" + path.dirname(file).split(path.sep).slice(1).join("/")
      .replace("[division]", "police").replace(/\[[^\]]+\]/g, "missing-test-record");
    return Array.from(new Set(methods)).map((method) => ({ url, method, source }));
  });
}
const inventory = routes();
const protectedRoutes = inventory.filter(({ url }) => !url.startsWith("/api/auth/"));

async function request(url: string, method = "GET", cookie = "", body?: string) {
  return fetch(`${baseUrl}${url}`, {
    method, redirect: "manual", headers: { cookie, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body, signal: AbortSignal.timeout(30000),
  });
}
async function login(email: string) {
  const response = await request("/api/auth/login", "POST", "", JSON.stringify({ email, password: "fixture-password" }));
  assert.equal(response.status, 200, email);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.match(cookie, /tc_admin_session=/);
  return cookie;
}

let adminCookie: string;
let superCookie: string;
before(async () => {
  adminCookie = await login("admin-police@mock.local");
  superCookie = await login("super@mock.local");
});

test("every protected HTTP method rejects unauthenticated requests before touching data", async (t) => {
  assert.ok(protectedRoutes.length > 100, "route inventory must cover the app");
  for (const route of protectedRoutes) await t.test(`${route.method} ${route.url}`, async () => {
    const response = await request(route.url, route.method);
    assert.equal(response.status, 401, `${route.method} ${route.url}: ${await response.text()}`);
  });
});

test("every division and super-admin HTTP method enforces tenant or role boundaries", async (t) => {
  for (const route of protectedRoutes) await t.test(`${route.method} ${route.url}`, async () => {
    const url = route.url.replace("/api/police/", "/api/fire/");
    const response = await request(url, route.method, adminCookie);
    const expected = /\/student\//.test(url) ? 401 : 403;
    assert.equal(response.status, expected, `${route.method} ${url}: ${await response.text()}`);
  });
});

test("JSON mutation handlers reject null and malformed bodies without server errors", async (t) => {
  for (const route of protectedRoutes.filter((r) => ["POST", "PATCH", "PUT"].includes(r.method) && /safeParse\(body\)/.test(r.source))) {
    await t.test(`${route.method} ${route.url}`, async () => {
      for (const body of ["null", "{"]) {
        const response = await request(route.url, route.method, superCookie, body);
        assert.equal(response.status, 400, `${route.method} ${route.url}: ${await response.text()}`);
      }
    });
  }
});

test("public authentication endpoints reject missing credentials and untrusted portal origins", async () => {
  for (const url of ["/api/auth/login", "/api/auth/student-login"]) {
    for (const body of ["{", "null", "{}", JSON.stringify({ email: "bad", password: "", division: 9, name: [] })]) {
      const response = await request(url, "POST", "", body);
      assert.equal(response.status, 400);
      assert.ok((await response.json()).error);
    }
  }
  assert.equal((await request("/api/auth/me")).status, 401);
  const bridge = await fetch(`${baseUrl}/api/auth/portal-bridge`, {
    method: "POST", body: new URLSearchParams({ launchToken: "fixture-token" }), headers: { origin: "https://untrusted.invalid" },
  });
  assert.equal(bridge.status, 403);
});

test("invalid numeric queries and cross-student references cannot mutate records", async () => {
  for (const weeks of ["NaN", "Infinity", "1.5"]) {
    assert.equal((await request(`/api/super-admin/student-trend?weeks=${weeks}`, "GET", superCookie)).status, 400);
  }
  const fixture = JSON.parse(readFileSync(".local/mock-db.json", "utf8"));
  const fireStudent = fixture.studentsByDivision.fire[0];
  const beforeState = JSON.stringify(fireStudent);
  const response = await request(`/api/police/students/${fireStudent.id}`, "PATCH", adminCookie, JSON.stringify({ name: "unauthorized-change" }));
  assert.ok(response.status === 400 || response.status === 404);
  const afterState = JSON.parse(readFileSync(".local/mock-db.json", "utf8"));
  assert.equal(JSON.stringify(afterState.studentsByDivision.fire[0]), beforeState);
});
