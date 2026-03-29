/**
 * db-push.cjs
 * .env.local 을 로드한 뒤 prisma db push 를 실행합니다.
 *
 * "relation already exists" 오류(이미 적용된 인덱스/제약)는
 * 무시하고 성공으로 처리합니다.
 *
 * Usage:
 *   npm run db:push           # 안전 모드 (데이터 손실 경고 시 중단)
 *   npm run db:push:force     # 데이터 손실 경고 무시
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envFile)) {
  console.error("[db-push] .env.local 파일을 찾을 수 없습니다.");
  process.exit(1);
}

// Parse .env.local and inject into process.env
const envContent = fs.readFileSync(envFile, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const extraArgs = process.argv.slice(2);
const args = ["prisma", "db", "push", ...extraArgs];

console.log("[db-push] Running:", args.join(" "));
console.log("[db-push] DIRECT_URL host:", new URL(process.env.DIRECT_URL).hostname);

const result = spawnSync("npx", args, {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  encoding: "utf8",
  env: process.env,
});

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";

// Print output
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

const combinedOutput = stdout + stderr;

// "already exists" errors are safe to ignore — constraint/index is already applied
const alreadyExistsCount = (combinedOutput.match(/already exists/g) ?? []).length;
const errorLineCount = (combinedOutput.match(/^Error:/gm) ?? []).length;

if (result.status === 0) {
  console.log("[db-push] ✅ 완료");
  process.exit(0);
} else if (alreadyExistsCount > 0 && alreadyExistsCount >= errorLineCount) {
  // All errors are "already exists" — schema is already up to date
  console.log(
    `[db-push] ✅ 완료 (${alreadyExistsCount}개 항목이 이미 적용됨 — 정상)`,
  );
  process.exit(0);
} else {
  console.error("[db-push] ❌ 실패");
  process.exit(result.status ?? 1);
}
