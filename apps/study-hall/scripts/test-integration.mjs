import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

const root = process.cwd();
const runtime = path.join(root, ".local", `test-${randomUUID().slice(0, 8)}`);
fs.mkdirSync(runtime, { recursive: true });
function copySource(source, destination) {
  if (fs.lstatSync(source).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) copySource(path.join(source, name), path.join(destination, name));
  } else {
    fs.copyFileSync(source, destination);
  }
}
for (const name of ["app", "components", "lib", "public", "prisma", "scripts", "tests", "docs", "package.json", "middleware.ts", "next.config.mjs", "tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "postcss.config.js", "next-env.d.ts", ".eslintrc.json", ".eslintrc.cjs"]) {
  if (fs.existsSync(path.join(root, name))) copySource(path.join(root, name), path.join(runtime, name));
}
fs.symlinkSync(path.join(root, "node_modules"), path.join(runtime, "node_modules"), "junction");
// Do not inherit database credentials, service keys, cookies, or another server's build directory.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programdata|home|number_of_processors)$/i.test(key)));
Object.assign(env, {
  NODE_ENV: "production", MOCK_MODE: "true", NEXT_TELEMETRY_DISABLED: "1",
  APP_SESSION_SECRET: randomUUID() + randomUUID(),
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-only",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-only", DATABASE_URL: "postgresql://test:test@127.0.0.1:9/test",
  DIRECT_URL: "postgresql://test:test@127.0.0.1:9/test", NEXT_PUBLIC_APP_URL: "http://127.0.0.1",
});
console.log(`[integration] isolated workspace: ${runtime}`);
const log = fs.openSync(path.join(runtime, "integration.log"), "a");
async function run(args, extra = {}) {
  const child = spawn(process.execPath, args, { cwd: runtime, env: { ...env, ...extra }, stdio: ["ignore", log, log] });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${args.join(" ")} failed (${code}); see ${path.join(runtime, "integration.log")}`);
}
async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
let server;
try {
  console.log("[integration] production build");
  await run(["node_modules/next/dist/bin/next", "build"]);
  console.log("[integration] existing operational smoke scenarios");
  await run(["scripts/smoke-test.mjs"], { SMOKE_TEST_PORT: String(await freePort()) });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: runtime, env, stdio: ["ignore", log, log] });
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try { if ((await fetch(`${baseUrl}/api/auth/me`, { signal: AbortSignal.timeout(2000) })).status === 401) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Isolated HTTP test server did not become ready.");
  console.log("[integration] HTTP authorization, division and invalid-input matrix");
  await run(["--import", "tsx", "--test", "tests/integration/http-contracts.test.ts"], { TEST_BASE_URL: baseUrl });
  await run(["--import", "tsx", "--test", "tests/integration/chat-review.test.ts"], { TEST_BASE_URL: baseUrl });
  await run(["--import", "tsx", "--test", "tests/integration/exam-import-http.test.ts"], { TEST_BASE_URL: baseUrl });
  await run(["--import", "tsx", "--test", "tests/integration/exam-analysis-http.test.ts"], { TEST_BASE_URL: baseUrl });
  await run(["--import", "tsx", "--test", "tests/integration/exam-analysis-export-http.test.ts"], { TEST_BASE_URL: baseUrl });
  console.log(`[integration] PASS; evidence: ${path.join(runtime, "integration.log")}`);
} catch (error) {
  console.error(error.message);
  console.error(fs.readFileSync(path.join(runtime, "integration.log"), "utf8").slice(-12000));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  fs.closeSync(log);
}
