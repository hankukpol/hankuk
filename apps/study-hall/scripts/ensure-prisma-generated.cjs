const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const appRoot = path.resolve(__dirname, "..");
const schemaPath = path.resolve(appRoot, "prisma/schema.prisma");
const generatedDir = path.resolve(appRoot, "../../node_modules/.prisma/client");
const generatedIndexPath = path.join(generatedDir, "index.js");
const generatedDefaultPath = path.join(generatedDir, "default.js");
const prismaClientPackagePath = require.resolve("@prisma/client/package.json", {
  paths: [appRoot],
});
const generatedVirtualDefaultPath = path.resolve(
  path.dirname(prismaClientPackagePath),
  "../../.prisma/client/default.js",
);
const stampDir = path.resolve(appRoot, ".local");
const stampPath = path.join(stampDir, "prisma-client-schema.sha256");
const shouldForceGenerate = process.argv.includes("--force");

function getStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function shouldGenerateClient() {
  if (shouldForceGenerate || process.env.FORCE_PRISMA_GENERATE === "true") {
    return true;
  }

  const generatedIndexStat = getStat(generatedIndexPath);
  const generatedDefaultStat = getStat(generatedDefaultPath);

  if (!generatedIndexStat || !generatedDefaultStat) {
    return true;
  }

  return readSchemaStamp() !== getSchemaHash();
}

function patchDefaultEntry() {
  const targetPaths = Array.from(new Set([generatedDefaultPath, generatedVirtualDefaultPath]));

  for (const targetPath of targetPaths) {
    if (!fs.existsSync(targetPath)) {
      continue;
    }

    const current = fs.readFileSync(targetPath, "utf8");
    const next = current
      .replace("require('#main-entry-point')", "require('.')")
      .replace("require('./index.js')", "require('.')");

    if (next !== current) {
      fs.writeFileSync(targetPath, next, "utf8");
    }
  }
}

function getSchemaHash() {
  return crypto.createHash("sha256").update(fs.readFileSync(schemaPath)).digest("hex");
}

function readSchemaStamp() {
  try {
    return fs.readFileSync(stampPath, "utf8").trim();
  } catch {
    return null;
  }
}

function writeSchemaStamp(schemaHash) {
  fs.mkdirSync(stampDir, { recursive: true });
  fs.writeFileSync(stampPath, `${schemaHash}\n`, "utf8");
}

const lockPath = path.join(stampDir, "prisma-generate.lock");
const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_WAIT_MS = 5 * 60 * 1000;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 개발 서버를 여러 개 동시에 띄우면 같은 node_modules/.prisma/client 에 generate 가
 * 겹쳐 클라이언트가 깨진다. 먼저 잡은 쪽만 생성하고 나머지는 끝날 때까지 기다린다.
 */
function acquireLock() {
  fs.mkdirSync(stampDir, { recursive: true });
  const waitStartedAt = Date.now();

  for (;;) {
    try {
      const handle = fs.openSync(lockPath, "wx");
      fs.writeFileSync(handle, `${process.pid}\n`);
      fs.closeSync(handle);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") {
        // 잠금 자체를 만들지 못하면 생성은 진행한다. 막는 것보다 낫다.
        return false;
      }

      const lockStat = getStat(lockPath);

      if (lockStat && Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
        console.warn("[prisma] 오래된 잠금 파일을 정리하고 진행합니다.");
        try {
          fs.rmSync(lockPath, { force: true });
        } catch {
          return false;
        }
        continue;
      }

      if (Date.now() - waitStartedAt > LOCK_WAIT_MS) {
        console.warn("[prisma] 다른 프로세스의 생성이 끝나기를 기다리다 시간이 초과됐습니다.");
        return false;
      }

      console.log("[prisma] 다른 프로세스가 Prisma Client 를 생성 중입니다. 기다립니다...");
      sleepSync(1000);
    }
  }
}

function releaseLock(held) {
  if (!held) return;
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    // 잠금 해제 실패는 다음 실행의 stale 처리로 회수된다.
  }
}

if (!shouldGenerateClient()) {
  patchDefaultEntry();
  process.exit(0);
}

const lockHeld = acquireLock();

try {
  // 기다리는 동안 다른 프로세스가 이미 끝냈을 수 있다.
  if (!shouldGenerateClient()) {
    patchDefaultEntry();
    process.exit(0);
  }

  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCliPath, "generate"], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(
      "[prisma] Prisma Client generation failed. If Windows reports an EPERM query_engine error, stop running study-hall Node processes and retry.",
    );
    process.exit(result.status ?? 1);
  }

  patchDefaultEntry();
  writeSchemaStamp(getSchemaHash());
} finally {
  releaseLock(lockHeld);
}
