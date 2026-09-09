import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { normalizeTargetPath } from "../lib/safe-redirect";

type Launch = { user_id: string; division_slug: string | null; target_path: string; target_role: string };
const launch: Launch = { user_id: "user-1", division_slug: "police", target_path: "/police/admin", target_role: "admin" };
const activeAdmin = { id: "admin-1", userId: "user-1", name: "테스트 관리자", role: "ADMIN", isActive: true, divisionId: "division-1", division: { id: "division-1", slug: "police" } };

// Execute the actual route with closed dependencies: no Auth/DB/network access.
function fixture(options: { launch?: Launch | null; admin?: typeof activeAdmin | null; rpcError?: boolean } = {}) {
  let consumed = false;
  let rpcCalls = 0;
  const sessions: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "@hankuk/config": {
      HANKUK_APP_KEYS: { STUDY_HALL: "study-hall" },
      getHankukServiceOrigins: () => ["https://portal.example.test"],
      isHankukPortalBridgeRoleAllowed: (_app: string, role: string) => ["super_admin", "admin", "assistant"].includes(role),
    },
    "@supabase/supabase-js": { createClient: () => ({ rpc: async (name: string, args: Record<string, string>) => {
      rpcCalls++;
      assert.equal(name, "consume_portal_launch_token");
      assert.equal(args.p_app_key, "study-hall");
      assert.equal(args.p_plain_token, "one-time-fixture");
      if (options.rpcError) return { data: null, error: { message: "unavailable" } };
      if (consumed) return { data: [], error: null };
      consumed = true;
      const row = options.launch === undefined ? launch : options.launch;
      return { data: row ? [row] : [], error: null };
    } }) },
    "@/lib/auth": { applyAdminContextCookies: async (response: NextResponse, session: unknown) => {
      sessions.push(session);
      response.cookies.set("fixture-app-session", "issued");
    } },
    "@/lib/local-env-guard": { assertLocalRuntimeDoesNotUseRemoteSupabase: () => {} },
    "@/lib/prisma": { prisma: { admin: { findUnique: async (args: unknown) => {
      assert.deepEqual(args && (args as { where: unknown }).where, { userId: (options.launch ?? launch).user_id });
      return options.admin === undefined ? activeAdmin : options.admin;
    } } } },
    "@/lib/safe-redirect": { normalizeTargetPath },
    "@/lib/api-error-response": { toApiErrorResponse: (_error: unknown, message: string, status = 500) => NextResponse.json({ error: message }, { status }) },
  };
  const code = ts.transpileModule(readFileSync("app/api/auth/portal-bridge/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { POST: (request: NextRequest) => Promise<NextResponse> } };
  new Function("require", "module", "exports", "process", code)((id: string) => {
    assert.ok(id in dependencies, `Unexpected route dependency: ${id}`);
    return dependencies[id];
  }, loaded, loaded.exports, { env: { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" } });
  return { sessions, rpcCalls: () => rpcCalls, post: (token = "one-time-fixture", origin: string | null = "https://portal.example.test") => loaded.exports.POST(new NextRequest("https://study.example.test/api/auth/portal-bridge", {
    method: "POST", headers: origin ? { origin } : {}, body: new URLSearchParams({ launchToken: token }),
  })) };
}

test("portal route: successful one-time launch issues only app context and redirects with GET", async () => {
  const f = fixture();
  const first = await f.post();
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("location"), "https://study.example.test/police/admin");
  assert.equal(f.sessions.length, 1);
  assert.equal((await f.post()).status, 401);
  assert.equal(f.sessions.length, 1);
});

test("portal route: missing token and forbidden origin never consume the token", async () => {
  const f = fixture();
  assert.equal((await f.post(" ")).status, 400);
  assert.equal((await f.post("one-time-fixture", "https://attacker.example.test")).status, 403);
  assert.equal(f.rpcCalls(), 0);
});

test("portal route: origin-less webview retains one-time token validation", async () => {
  const f = fixture();
  assert.equal((await f.post("one-time-fixture", null)).status, 303);
  assert.equal((await f.post("one-time-fixture", null)).status, 401);
});

for (const [name, options, status] of [
  ["expired token", { launch: null }, 401],
  ["missing staff", { admin: null }, 403],
  ["inactive staff", { admin: { ...activeAdmin, isActive: false } }, 403],
  ["wrong division", { launch: { ...launch, division_slug: "fire" } }, 403],
  ["role escalation", { launch: { ...launch, target_role: "super_admin" } }, 403],
  ["unsupported role", { launch: { ...launch, target_role: "staff" } }, 403],
  ["RPC failure", { rpcError: true }, 500],
] as const) {
  test(`portal route: ${name} does not issue a session`, async () => {
    const f = fixture(options);
    assert.equal((await f.post()).status, status);
    assert.equal(f.sessions.length, 0);
  });
}

test("portal route: assistant retains its role and external redirects are rejected", async () => {
  const f = fixture({ launch: { ...launch, target_role: "assistant", target_path: "//attacker.example.test" }, admin: { ...activeAdmin, role: "ASSISTANT" } });
  const response = await f.post();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://study.example.test/police/assistant");
  assert.equal((f.sessions[0] as { role: string }).role, "ASSISTANT");
});
