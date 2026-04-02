const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const appRoot = path.resolve(__dirname, "..");
const schemaPath = path.resolve(appRoot, "prisma/schema.prisma");
const generatedDir = path.resolve(appRoot, "../../node_modules/.prisma/client");
const generatedIndexPath = path.join(generatedDir, "index.js");
const generatedDefaultPath = path.join(generatedDir, "default.js");
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
  if (!fs.existsSync(generatedDefaultPath)) {
    return;
  }

  const current = fs.readFileSync(generatedDefaultPath, "utf8");
  const next = current
    .replace("require('#main-entry-point')", "require('.')")
    .replace("require('./index.js')", "require('.')");

  if (next !== current) {
    fs.writeFileSync(generatedDefaultPath, next, "utf8");
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
