import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

const root = process.cwd();
const runtime = path.join(root, ".local", `policy-${randomUUID().slice(0, 8)}`);
function copy(source, destination) {
  if (fs.lstatSync(source).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name));
  } else fs.copyFileSync(source, destination);
}
fs.mkdirSync(runtime, { recursive: true });
for (const name of ["app", "components", "lib", "public", "prisma", "scripts", "tests", "docs", "package.json", "middleware.ts", "next.config.mjs", "tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "postcss.config.js", "next-env.d.ts", ".eslintrc.json"]) {
  if (fs.existsSync(path.join(root, name))) copy(path.join(root, name), path.join(runtime, name));
}
fs.symlinkSync(path.join(root, "node_modules"), path.join(runtime, "node_modules"), "junction");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programdata|home|number_of_processors)$/i.test(key)));
Object.assign(env, { NODE_ENV: "development", MOCK_MODE: "true", NEXT_TELEMETRY_DISABLED: "1", APP_SESSION_SECRET: randomUUID() + randomUUID(), NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-only", SUPABASE_SERVICE_ROLE_KEY: "fixture-only", DATABASE_URL: "postgresql://test:test@127.0.0.1:9/test", DIRECT_URL: "postgresql://test:test@127.0.0.1:9/test" });
const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
env.NEXT_PUBLIC_APP_URL = baseUrl;
const log = fs.openSync(path.join(runtime, "server.log"), "a");
const seed = spawn(process.execPath, ["--import", "tsx", "scripts/fixtures/policy-review.ts"], { cwd: runtime, env, stdio: ["ignore", log, log] });
const [code] = await once(seed, "exit");
if (code !== 0) throw new Error(`Fixture initialization failed: ${runtime}/server.log`);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: runtime, env, stdio: ["ignore", log, log] });
fs.mkdirSync(path.join(root, ".local/policy-review"), { recursive: true });
fs.writeFileSync(path.join(root, ".local/policy-review/runtime.json"), JSON.stringify({ runtime, baseUrl, pid: server.pid, fixtureOnly: true }, null, 2));
console.log(JSON.stringify({ runtime, baseUrl, fixtureOnly: true }));
await once(server, "exit");
fs.closeSync(log);
